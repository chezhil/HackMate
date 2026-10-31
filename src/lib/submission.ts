import "server-only";
import { AiUnavailableError, generateJson } from "./ai";
import { all, get, run, stmt, withAccountLock } from "./db";
import { factsBlock, getDetails } from "./details";
import { deleteFile, readFile } from "./files";
import { videoLimitSec } from "./pitch";
import { getProject, projectBlock } from "./project";
import { fetchPublic } from "./publicFetch";
import { getHackathon, listTracked } from "./repo";
import { USER_AGENT } from "./sources/util";
import { listTeam } from "./team";
import { isHttpUrl } from "./validation";
import { checklistComplete } from "./checklist";
import type { ChecklistItem, ChecklistKind, SubmissionCheck } from "./types";

type Row = Record<string, string | number | null>;

function toItem(r: Row): ChecklistItem {
  return {
    id: r.id as number,
    label: r.label as string,
    detail: (r.detail as string) ?? null,
    kind: r.kind as ChecklistKind,
    required: Boolean(r.required),
    done: Boolean(r.done),
    value: (r.value as string) ?? null,
    file: (r.file as string) ?? null,
    mime: (r.mime as string) ?? null,
    meta: r.meta ? JSON.parse(r.meta as string) : null,
    origin: r.origin as ChecklistItem["origin"],
  };
}

type Seed = Omit<ChecklistItem, "id" | "done" | "value" | "file" | "mime">;

/** Guess what kind of proof a deliverable needs from its wording. */
function seedFor(item: string, limit: string | null): Seed {
  const text = `${item} ${limit ?? ""}`;
  const base = { label: item, detail: limit, required: true, origin: "rules" as const };
  if (/screenshot|usage card|image|photo|insights/i.test(text)) return { ...base, kind: "file", meta: { accept: "image" } };
  if (/video|demo recording|walkthrough/i.test(text)) return { ...base, kind: "link", meta: { accept: "video" } };
  if (/deck|slides|ppt|presentation|pdf/i.test(text)) return { ...base, kind: "link", meta: { accept: "pdf" } };
  if (/github|repo|source code|link|url|website|deployed|live/i.test(text)) return { ...base, kind: "link", meta: null };
  return { ...base, kind: "check", meta: null };
}

/**
 * What this hackathon asks you to hand in. When the rules list deliverables, the checklist is exactly those
 * (plus submitting and adding teammates). Only when they list nothing do the usual items appear, and then
 * as optional suggestions, so a hackathon that wants a PR link and a blog post never asks for a demo video.
 */
async function seedsFor(hackathonId: string): Promise<Seed[]> {
  const info = (await getDetails(hackathonId))?.info;
  const fromRules: Seed[] = (info?.deliverables ?? []).map((d) => seedFor(d.item, d.limit));
  const limit = await videoLimitSec(hackathonId);
  for (const s of fromRules) if (s.meta?.accept === "video" && limit) s.meta.limitSec = limit;

  const suggestions: Seed[] = fromRules.length
    ? []
    : [
        { label: "Public GitHub repo with a README", detail: "Setup steps, screenshots, tech stack, team", kind: "link", required: false, meta: null, origin: "default" },
        { label: "Demo video", detail: limit ? `Max ${Math.round(limit / 6) / 10} min` : "Usually 2–3 minutes", kind: "link", required: false, meta: { accept: "video", ...(limit ? { limitSec: limit } : {}) }, origin: "default" },
        { label: "Pitch deck", detail: "5–10 slides: problem, solution, demo, tech, impact, team", kind: "link", required: false, meta: { accept: "pdf" }, origin: "default" },
      ];
  const always = [
    { label: "Project submitted on the hackathon platform", detail: "Before the submission deadline", kind: "check", required: true, meta: null, origin: "default" },
    (info?.teamSize.max ?? (await getHackathon(hackathonId))?.teamMax ?? 1) > 1 && { label: "All teammates added to the submission", detail: null, kind: "check", required: true, meta: null, origin: "default" },
  ].filter(Boolean) as Seed[];
  return [...fromRules, ...suggestions, ...always];
}

/** Whether the rules have been read and list deliverables yet. */
const rulesKnown = async (hackathonId: string) => ((await getDetails(hackathonId))?.info?.deliverables.length ?? 0) > 0;

/** An item you haven't touched: not ticked, nothing attached, not one you added. Safe to replace. */
const untouched = (i: ChecklistItem) => i.origin !== "custom" && !i.done && !i.value && !i.file;

function insertSeeds(hackathonId: string, seeds: Seed[], startSort: number) {
  const insert = stmt("INSERT INTO checklist_items (hackathon_id, label, detail, kind, required, meta, origin, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",);
  seeds.forEach((s, i) =>
    insert.run(hackathonId, s.label, s.detail, s.kind, s.required ? 1 : 0, s.meta ? JSON.stringify(s.meta) : null, s.origin, startSort + i),
  );
}

/**
 * Re-derive the rule-based items: replaces the ones you haven't touched with what the rules ask for now,
 * keeps your own items and anything ticked or attached, and doesn't duplicate what's already there.
 */
export async function rebuildChecklist(hackathonId: string) {
  const current = ((await all("SELECT * FROM checklist_items WHERE hackathon_id = ? ORDER BY sort, id", hackathonId)) as Row[]).map(toItem);
  const del = stmt("DELETE FROM checklist_items WHERE id = ?");
  for (const i of current) if (untouched(i)) await del.run(i.id);
  const kept = new Set(current.filter((i) => !untouched(i)).map((i) => i.label.trim().toLowerCase()));
  const fresh = (await seedsFor(hackathonId)).filter((s) => !kept.has(s.label.trim().toLowerCase()));
  // Rule items go first; whatever you kept follows in its old order.
  insertSeeds(hackathonId, fresh, -fresh.length);
}

export async function listChecklist(hackathonId: string): Promise<ChecklistItem[]> {
  const read = async () => ((await all("SELECT * FROM checklist_items WHERE hackathon_id = ? ORDER BY sort, id", hackathonId)) as Row[]).map(toItem);
  let items = await read();
  if (items.length === 0) {
    insertSeeds(hackathonId, await seedsFor(hackathonId), 0);
    items = await read();
  } else if (await rulesKnown(hackathonId) && !items.some((i) => i.origin === "rules") && items.every((i) => i.origin === "custom" || untouched(i))) {
    // Built before the AI had read the rules: now that it has, swap the generic list for the real one.
    await rebuildChecklist(hackathonId);
    items = await read();
  }
  return items;
}

export async function addChecklistItem(hackathonId: string, label: string, kind: ChecklistKind, required: boolean) {
  const max = (await get("SELECT MAX(sort) AS m FROM checklist_items WHERE hackathon_id = ?", hackathonId)) as { m: number | null };
  (await run("INSERT INTO checklist_items (hackathon_id, label, kind, required, origin, sort) VALUES (?, ?, ?, ?, 'custom', ?)", hackathonId, label, kind, required ? 1 : 0, (max.m ?? 0) + 1));
}

export async function itemHackathon(id: number): Promise<string | null> {
  const r = (await get("SELECT hackathon_id FROM checklist_items WHERE id = ?", id)) as { hackathon_id: string } | undefined;
  return r?.hackathon_id ?? null;
}

export async function updateChecklistItem(
  id: number,
  patch: { done?: boolean; value?: string | null; file?: string | null; mime?: string | null; meta?: ChecklistItem["meta"]; label?: string; required?: boolean },
) {
  return withAccountLock(`submission:updateChecklistItem:${id}`, async () => {
    const cur = (await get("SELECT * FROM checklist_items WHERE id = ?", id)) as Row | undefined;
    if (!cur) throw new Error("Item not found");
    const item = toItem(cur);
    if (patch.file !== undefined && item.file && patch.file !== item.file) await deleteFile(item.file);
    const next = { ...item, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) };
    // Duration describes this upload, not the checklist requirement. Never carry it to a replacement.
    if (patch.file !== undefined && patch.file !== item.file) {
      next.meta = { ...item.meta, ...patch.meta };
      if (patch.meta?.durationSec === undefined) delete next.meta.durationSec;
    } else if (patch.meta) {
      next.meta = { ...item.meta, ...patch.meta };
    }
    // Attaching proof ticks the item off.
    if ((patch.value || patch.file) && patch.done === undefined) next.done = true;
    (await run("UPDATE checklist_items SET done = ?, value = ?, file = ?, mime = ?, meta = ?, label = ?, required = ? WHERE id = ?", next.done ? 1 : 0, next.value || null, next.file, next.mime, next.meta ? JSON.stringify(next.meta) : null,
        next.label.trim() || item.label, next.required ? 1 : 0, id,));
  });
}

export async function deleteChecklistItem(id: number) {
  const r = (await get("SELECT file FROM checklist_items WHERE id = ?", id)) as { file: string | null } | undefined;
  await deleteFile(r?.file);
  (await run("DELETE FROM checklist_items WHERE id = ?", id));
}

// ---------- verification ----------

/** Whether a submission link opens. Links are typed in, so private addresses (and redirects to them) count as broken. */
async function head(url: string): Promise<{ ok: boolean; status: number; finalUrl: string }> {
  try {
    const res = await fetchPublic(url, { headers: { "User-Agent": USER_AGENT }, timeoutMs: 12_000 });
    await res.body?.cancel();
    return { ok: res.ok, status: res.status, finalUrl: res.url || url };
  } catch {
    return { ok: false, status: 0, finalUrl: url };
  }
}

async function checkGithub(url: string, label: string, itemId: number | null): Promise<SubmissionCheck[]> {
  const parsed = new URL(url);
  if (!["github.com", "www.github.com"].includes(parsed.hostname)) return [];
  const m = parsed.pathname.match(/^\/([\w.-]+)\/([\w.-]+)(?:\/|$)/);
  if (!m) return [{ itemId, label, status: "fail", detail: "Use a GitHub repository link, including the owner and repository name." }];
  const repo = `${m[1]}/${m[2].replace(/\.git$/, "")}`;
  const api = (p: string) => fetch(`https://api.github.com/repos/${repo}${p}`, { headers: { "User-Agent": "HackMate" }, signal: AbortSignal.timeout(12_000) });
  try {
    const res = await api("");
    if (res.status === 404) return [{ itemId, label, status: "fail", detail: `${repo} isn't publicly visible. Make the repo public before judging.` }];
    if (!res.ok) return [{ itemId, label, status: "info", detail: `Couldn't check ${repo} (GitHub HTTP ${res.status}).` }];
    const data = (await res.json()) as { pushed_at: string; description: string | null };
    const readme = await api("/readme");
    const out: SubmissionCheck[] = [{ itemId, label, status: "pass", detail: `${repo} is public.` }];
    out.push(
      readme.ok
        ? { itemId, label: "README", status: "pass", detail: "Repo has a README." }
        : { itemId, label: "README", status: "warn", detail: "No README found. Judges look for setup steps and screenshots." },
    );
    if (!data.description) out.push({ itemId, label: "Repo description", status: "warn", detail: "Add a one-line description on GitHub." });
    return out;
  } catch {
    return [{ itemId, label, status: "info", detail: `Couldn't reach GitHub to check ${repo}.` }];
  }
}

async function checkScreenshot(item: ChecklistItem): Promise<SubmissionCheck | null> {
  const data = item.file ? await readFile(item.file) : null;
  if (!data || !item.mime?.startsWith("image/")) return null;
  try {
    const res = await generateJson<{ matches: boolean; reason: string }>({
      task: "vision",
      temperature: 0,
      system:
        'You check hackathon submission screenshots. Say whether the image plausibly shows what the checklist item asks for and is legible. Reply with JSON { "matches": boolean, "reason": string (one sentence) }.',
      messages: [{ role: "user", content: `Checklist item: ${item.label}${item.detail ? ` (${item.detail})` : ""}` }],
      media: { mime: item.mime, base64: data.toString("base64") },
      geminiTimeoutMs: 45_000, // it's a nice-to-have; don't hold up the whole check
      // Re-running the checks doesn't re-send an unchanged screenshot (Gemini's free tier is small).
      cache: { ttlDays: 30 },
    });
    return { itemId: item.id, label: item.label, status: res.data.matches ? "pass" : "warn", detail: `Screenshot check: ${res.data.reason}` };
  } catch (e) {
    const why = e instanceof AiUnavailableError ? e.message : (e as Error).message;
    return { itemId: item.id, label: item.label, status: "info", detail: `Couldn't check the image with AI (${why.slice(0, 120)}).` };
  }
}

/**
 * Check the submission: deadline, required items, links that actually load, a public GitHub repo
 * with a README, video length against the limit, screenshots that show the right thing (Gemini),
 * and an AI read-through against the rules.
 */
export async function verifySubmission(hackathonId: string): Promise<{ checks: SubmissionCheck[]; summary: string | null }> {
  const h = await getHackathon(hackathonId);
  if (!h) throw new Error("Unknown hackathon");
  const items = await listChecklist(hackathonId);
  const project = await getProject(hackathonId);
  const checks: SubmissionCheck[] = [];

  // Deadline
  const tracked = (await listTracked()).find((t) => t.hackathonId === hackathonId);
  const due = tracked?.deadlines.find((d) => d.kind === "submission")?.dueAt ?? h.endsAt;
  if (due) {
    const hours = (new Date(due).getTime() - Date.now()) / 3600_000;
    checks.push(
      hours < 0
        ? { itemId: null, label: "Deadline", status: "fail", detail: "The submission deadline has passed." }
        : { itemId: null, label: "Deadline", status: hours < 6 ? "warn" : "pass", detail: `${hours < 48 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`} left to submit.` },
    );
  }

  // Team size
  const max = (await getDetails(hackathonId))?.info?.teamSize.max ?? h.teamMax;
  const size = (await listTeam(hackathonId)).filter((t) => t.confirmed).length + 1;
  const min = (await getDetails(hackathonId))?.info?.teamSize.min ?? h.teamMin;
  if (min && size < min) checks.push({ itemId: null, label: "Team size", status: "fail", detail: `Your team has ${size} people; at least ${min} are required.` });
  if (max && size > max) checks.push({ itemId: null, label: "Team size", status: "fail", detail: `Your team has ${size} people; the limit is ${max}.` });

  // Items
  const linkChecks: Promise<SubmissionCheck[]>[] = [];
  for (const item of items) {
    const missing = !checklistComplete(item);
    if (missing) {
      checks.push({ itemId: item.id, label: item.label, status: item.required ? "fail" : "warn", detail: item.required ? "Missing — required." : "Not done (optional)." });
      continue;
    }
    if (item.kind === "link" && item.value && !isHttpUrl(item.value)) {
      checks.push({ itemId: item.id, label: item.label, status: "fail", detail: "Enter a valid http:// or https:// link." });
      continue;
    }
    if (item.value && isHttpUrl(item.value)) {
      linkChecks.push(
        (async () => {
          if (["github.com", "www.github.com"].includes(new URL(item.value!).hostname)) return checkGithub(item.value!, item.label, item.id);
          const r = await head(item.value!);
          const out: SubmissionCheck[] = [
            r.ok
              ? { itemId: item.id, label: item.label, status: "pass", detail: "Link opens." }
              : { itemId: item.id, label: item.label, status: "fail", detail: `Link doesn't open for others (HTTP ${r.status || "no response"}). Check sharing settings.` },
          ];
          if (r.ok && /drive\.google\.com|docs\.google\.com/.test(item.value!)) {
            out.push({ itemId: item.id, label: item.label, status: "warn", detail: "Google Drive link: make sure it's shared as “Anyone with the link”." });
          }
          if (r.ok && item.meta?.accept === "video" && item.meta.limitSec && !item.meta.durationSec) {
            out.push({ itemId: item.id, label: item.label, status: "info", detail: `Check the video is under ${Math.round(item.meta.limitSec / 6) / 10} min — HackMate can only measure uploaded files.` });
          }
          return out;
        })(),
      );
    }
    if (item.meta?.durationSec && item.meta.limitSec) {
      const over = item.meta.durationSec > item.meta.limitSec;
      checks.push({
        itemId: item.id,
        label: item.label,
        status: over ? "fail" : "pass",
        detail: `Video is ${Math.round(item.meta.durationSec)}s; limit is ${item.meta.limitSec}s${over ? " — trim it." : "."}`,
      });
    }
  }
  if (project.repoUrl && !items.some((i) => i.value === project.repoUrl)) linkChecks.push(checkGithub(project.repoUrl, "Project repo", null));
  checks.push(...(await Promise.all(linkChecks)).flat());

  // Screenshots (Gemini, sequential to respect its rate limit)
  for (const item of items.filter((i) => i.file && i.mime?.startsWith("image/"))) {
    const c = await checkScreenshot(item);
    if (c) checks.push(c);
  }

  // AI read-through against the rules
  let summary: string | null = null;
  try {
    const info = (await getDetails(hackathonId))?.info;
    const res = await generateJson<{ summary: string; issues: { level: "fail" | "warn" | "info"; text: string }[] }>({
      task: "review",
      temperature: 0.2,
      system: `You review a hackathon submission against the rules before the team hits submit. Point out anything missing, risky or likely to cost points: disqualifying rule breaks, deliverables not covered, weak project description, missing links. Be concrete; don't repeat items already marked done unless there's a problem.
Reply with JSON { "summary": string (one or two sentences: ready or not?), "issues": [{ "level": "fail"|"warn"|"info", "text": string }] }.`,
      messages: [
        {
          role: "user",
          content: `${factsBlock(h)}
Rules / deliverables: ${JSON.stringify({ deliverables: info?.deliverables, alerts: info?.alerts, eligibility: info?.eligibility, rules: info?.rules })}

${await projectBlock(hackathonId)}

Checklist: ${JSON.stringify(items.map((i) => ({ label: i.label, required: i.required, done: i.done || Boolean(i.value || i.file), value: i.value, hasFile: Boolean(i.file) })))}`,
        },
      ],
    });
    summary = res.data.summary;
    checks.push(...res.data.issues.map((i) => ({ itemId: null, label: "AI review", status: i.level, detail: i.text }) as SubmissionCheck));
  } catch (e) {
    checks.push({ itemId: null, label: "AI review", status: "info", detail: (e as Error).message.slice(0, 200) });
  }

  const order = { fail: 0, warn: 1, info: 2, pass: 3 };
  return { checks: checks.sort((a, b) => order[a.status] - order[b.status]), summary };
}
