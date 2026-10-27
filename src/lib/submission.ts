import "server-only";
import { AiUnavailableError, generateJson } from "./ai";
import { db } from "./db";
import { factsBlock, getDetails } from "./details";
import { deleteFile, readFile } from "./files";
import { videoLimitSec } from "./pitch";
import { getProject, projectBlock } from "./project";
import { getHackathon, listTracked } from "./repo";
import { USER_AGENT } from "./sources/util";
import { listTeam } from "./team";
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

/** First visit: build the checklist from the rules the AI extracted, plus the usual must-haves. */
function seedChecklist(hackathonId: string) {
  const info = getDetails(hackathonId)?.info;
  const seeds: Seed[] = (info?.deliverables ?? []).map((d) => seedFor(d.item, d.limit));
  const has = (re: RegExp) => seeds.some((s) => re.test(s.label));
  const limit = videoLimitSec(hackathonId);
  for (const s of seeds) if (s.meta?.accept === "video" && limit) s.meta.limitSec = limit;

  const defaults: Seed[] = [
    // only required when the rules didn't spell out the deliverables themselves
    !has(/github|repo|source/i) && { label: "Public GitHub repo with a README", detail: "Setup steps, screenshots, tech stack, team", kind: "link", required: seeds.length === 0, meta: null, origin: "default" },
    !has(/video|demo/i) && { label: "Demo video", detail: limit ? `Max ${Math.round(limit / 6) / 10} min` : "Usually 2–3 minutes", kind: "link", required: true, meta: { accept: "video", ...(limit ? { limitSec: limit } : {}) }, origin: "default" },
    !has(/deck|slides|ppt|presentation/i) && { label: "Pitch deck", detail: "5–10 slides: problem, solution, demo, tech, impact, team", kind: "link", required: false, meta: { accept: "pdf" }, origin: "default" },
    { label: "Project submitted on the hackathon platform", detail: "Before the submission deadline", kind: "check", required: true, meta: null, origin: "default" },
    (info?.teamSize.max ?? 1) > 1 && { label: "All teammates added to the submission", detail: null, kind: "check", required: true, meta: null, origin: "default" },
    { label: "Tracks / sponsor prizes selected", detail: "Opt in to every prize you qualify for", kind: "check", required: false, meta: null, origin: "default" },
  ].filter(Boolean) as Seed[];

  const insert = db().prepare(
    "INSERT INTO checklist_items (hackathon_id, label, detail, kind, required, meta, origin, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  [...seeds, ...defaults].forEach((s, i) =>
    insert.run(hackathonId, s.label, s.detail, s.kind, s.required ? 1 : 0, s.meta ? JSON.stringify(s.meta) : null, s.origin, i),
  );
}

export function listChecklist(hackathonId: string): ChecklistItem[] {
  const count = db().prepare("SELECT COUNT(*) AS n FROM checklist_items WHERE hackathon_id = ?").get(hackathonId) as { n: number };
  if (count.n === 0) seedChecklist(hackathonId);
  return (db().prepare("SELECT * FROM checklist_items WHERE hackathon_id = ? ORDER BY sort, id").all(hackathonId) as Row[]).map(toItem);
}

export function addChecklistItem(hackathonId: string, label: string, kind: ChecklistKind, required: boolean) {
  const max = db().prepare("SELECT MAX(sort) AS m FROM checklist_items WHERE hackathon_id = ?").get(hackathonId) as { m: number | null };
  db()
    .prepare("INSERT INTO checklist_items (hackathon_id, label, kind, required, origin, sort) VALUES (?, ?, ?, ?, 'custom', ?)")
    .run(hackathonId, label, kind, required ? 1 : 0, (max.m ?? 0) + 1);
}

export function itemHackathon(id: number): string | null {
  const r = db().prepare("SELECT hackathon_id FROM checklist_items WHERE id = ?").get(id) as { hackathon_id: string } | undefined;
  return r?.hackathon_id ?? null;
}

export function updateChecklistItem(
  id: number,
  patch: { done?: boolean; value?: string | null; file?: string | null; mime?: string | null; meta?: ChecklistItem["meta"] },
) {
  const cur = db().prepare("SELECT * FROM checklist_items WHERE id = ?").get(id) as Row | undefined;
  if (!cur) throw new Error("Item not found");
  const item = toItem(cur);
  if (patch.file !== undefined && item.file && patch.file !== item.file) deleteFile(item.file);
  const next = { ...item, ...patch };
  // Attaching proof ticks the item off.
  if ((patch.value || patch.file) && patch.done === undefined) next.done = true;
  db()
    .prepare("UPDATE checklist_items SET done = ?, value = ?, file = ?, mime = ?, meta = ? WHERE id = ?")
    .run(next.done ? 1 : 0, next.value || null, next.file, next.mime, next.meta ? JSON.stringify({ ...item.meta, ...next.meta }) : null, id);
}

export function deleteChecklistItem(id: number) {
  const r = db().prepare("SELECT file FROM checklist_items WHERE id = ?").get(id) as { file: string | null } | undefined;
  deleteFile(r?.file);
  db().prepare("DELETE FROM checklist_items WHERE id = ?").run(id);
}

// ---------- verification ----------

async function head(url: string): Promise<{ ok: boolean; status: number; finalUrl: string }> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) });
    await res.body?.cancel();
    return { ok: res.ok, status: res.status, finalUrl: res.url };
  } catch {
    return { ok: false, status: 0, finalUrl: url };
  }
}

async function checkGithub(url: string, label: string, itemId: number | null): Promise<SubmissionCheck[]> {
  const m = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
  if (!m) return [];
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
  const data = item.file ? readFile(item.file) : null;
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
  const h = getHackathon(hackathonId);
  if (!h) throw new Error("Unknown hackathon");
  const items = listChecklist(hackathonId);
  const project = getProject(hackathonId);
  const checks: SubmissionCheck[] = [];

  // Deadline
  const tracked = listTracked().find((t) => t.hackathonId === hackathonId);
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
  const max = getDetails(hackathonId)?.info?.teamSize.max ?? h.teamMax;
  const size = listTeam(hackathonId).filter((t) => t.confirmed).length + 1;
  if (max && size > max) checks.push({ itemId: null, label: "Team size", status: "fail", detail: `Your team has ${size} people; the limit is ${max}.` });

  // Items
  const linkChecks: Promise<SubmissionCheck[]>[] = [];
  for (const item of items) {
    const missing = item.kind === "link" ? !item.value && !item.file : item.kind === "file" ? !item.file : !item.done;
    if (missing) {
      checks.push({ itemId: item.id, label: item.label, status: item.required ? "fail" : "warn", detail: item.required ? "Missing — required." : "Not done (optional)." });
      continue;
    }
    if (item.value && /^https?:\/\//.test(item.value)) {
      linkChecks.push(
        (async () => {
          if (/github\.com\//.test(item.value!)) return checkGithub(item.value!, item.label, item.id);
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
    const info = getDetails(hackathonId)?.info;
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

${projectBlock(hackathonId)}

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
