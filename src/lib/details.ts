import "server-only";
import { createHash } from "node:crypto";
import { AiUnavailableError, generate, generateJson } from "./ai";
import { all, get, run, stmt } from "./db";
import { getDescription, getHackathon } from "./repo";
import { fetchJson, fetchText, htmlToText, USER_AGENT } from "./sources/util";
import { passagesBlock, relevantPassages, resolveCitations } from "./citations";
import type { ChatMessage, Citation, Hackathon, HackathonDetails, HackathonInfo, WinnerProject } from "./types";

const MAX_SOURCE_CHARS = 45_000;

// ---------- source text ----------

/** Everything we can read about a hackathon, as plain text, for the AI and the rule scanner. */
async function gatherSourceText(h: Hackathon): Promise<string> {
  const parts: string[] = [];
  const feedText = await getDescription(h.id);
  if (feedText) parts.push(feedText);

  try {
    if (h.source === "devfolio") {
      const slug = new URL(h.url).hostname.split(".")[0];
      // The prizes endpoint has amounts, which the listing's prize names lack.
      const prizes = await fetchJson<{ name: string; desc: string | null; amount?: string | null; currency?: string | null }[]>(
        `https://api.devfolio.co/api/hackathons/${slug}/prizes`,
      ).catch(() => []);
      if (Array.isArray(prizes) && prizes.length) {
        const amount = (p: (typeof prizes)[number]) => (Number(p.amount) > 0 ? ` (${Number(p.amount)} ${p.currency ?? ""})` : "");
        parts.push(`## Prize amounts\n${prizes.map((p) => `- ${p.name}${amount(p)}${p.desc ? `: ${p.desc}` : ""}`).join("\n")}`);
      }
    } else if (h.url && (!["unstop", "devfolio", "devsemble"].includes(h.source) || !feedText)) {
      // Sources with brief listing text need the event page for complete rules.
      parts.push(htmlToText(await fetchText(h.url, { headers: { "User-Agent": USER_AGENT } })));
    }
  } catch (e) {
    console.warn("[details] could not fetch page for", h.id, (e as Error).message);
  }
  return parts.join("\n\n").slice(0, MAX_SOURCE_CHARS);
}

function factsBlock(h: Hackathon) {
  return [
    `Title: ${h.title}`,
    h.tagline && `Tagline: ${h.tagline}`,
    `Source: ${h.source}${h.url ? ` (${h.url})` : ""}`,
    `Mode: ${h.mode}${h.city ? ` — ${[h.venue, h.city, h.state, h.country].filter(Boolean).join(", ")}` : ""}`,
    h.startsAt && `Starts: ${h.startsAt}`,
    h.endsAt && `Ends: ${h.endsAt}`,
    h.regEndsAt && `Registration closes: ${h.regEndsAt}`,
    (h.teamMin || h.teamMax) && `Team size: ${h.teamMin ?? "?"}–${h.teamMax ?? "?"}`,
    h.prizeText && `Prizes: ${h.prizeText}`,
    h.entryFee && `Entry: ${h.entryFee}`,
    h.organizer && `Organizer: ${h.organizer}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- extraction ----------

const EXTRACT_PROMPT = `You read hackathon pages and pull out the facts a participant needs. Reply with JSON only, matching:
{
  "summary": string (2-3 sentences: what it is, who it's for, what to build),
  "teamSize": { "min": number|null, "max": number|null, "soloAllowed": boolean|null, "notes": string|null },
  "eligibility": string[],
  "deliverables": [{ "item": string, "limit": string|null }]  (e.g. pitch deck with max slides, demo video with max length, GitHub repo, live demo),
  "alerts": [{ "level": "critical"|"warning"|"info", "text": string }]  (gotchas that could disqualify or surprise someone: solo-only, mandatory deck/video, length limits, IP/ownership terms, eligibility limits, fees, in-person rounds, code-freshness rules),
  "ipTerms": string|null (who owns submissions / licences granted; quote briefly),
  "judges": [{ "name": string, "title": string|null }],
  "judgingCriteria": [{ "name": string, "weight": string|null, "description": string|null }],
  "tracks": [{ "name": string, "description": string|null }],
  "prizes": [{ "name": string, "value": string|null }],
  "importantDates": [{ "label": string, "date": string }]  (ISO 8601 when possible),
  "rules": string[] (other notable rules, short),
  "pastWinners": [{ "name": string, "description": string|null, "year": string|null }]  (only if the page mentions previous winners)
}
Only use information in the text. Use empty arrays / null when something isn't mentioned. Never invent judges, criteria or winners.`;

function toDetails(r: Record<string, unknown>): HackathonDetails {
  return {
    hackathonId: r.hackathon_id as string,
    sourceChars: (r.source_text as string).length,
    info: r.info ? (JSON.parse(r.info as string) as HackathonInfo) : null,
    provider: (r.provider as string) ?? null,
    error: (r.error as string) ?? null,
    fetchedAt: r.fetched_at as string,
  };
}

export async function getDetails(id: string): Promise<HackathonDetails | null> {
  const r = (await get("SELECT * FROM hackathon_details WHERE hackathon_id = ?", id));
  return r ? toDetails(r) : null;
}

export async function getSourceText(id: string): Promise<string> {
  const r = (await get("SELECT source_text FROM hackathon_details WHERE hackathon_id = ?", id)) as { source_text: string } | undefined;
  return r?.source_text ?? await getDescription(id) ?? "";
}

const building = new Map<string, Promise<HackathonDetails>>();

// "Reading the rules" is recorded in the database too, not just in this server's memory: on Vercel the read runs
// after the response and the page's polling can reach another instance, which must still see it as in progress.
// A read that hasn't finished within 5 minutes (the function limit) is treated as failed so it can start again.
const READING_KEY = (id: string) => `reading:${id}`;
const READING_FOR_MS = 5 * 60_000;

/** Record that a read has started: call before the response goes out, so the page polls from the first answer. */
export async function markReading(id: string) {
  await run("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", READING_KEY(id), new Date().toISOString());
}

/** Whether the rules are being read right now, on any server. */
export async function isBuilding(id: string): Promise<boolean> {
  if (building.has(id)) return true;
  const r = await get<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", READING_KEY(id));
  return !!r && Date.now() - new Date(r.value).getTime() < READING_FOR_MS;
}

/** Read the hackathon's page(s) and have the AI extract structured info. Cached until refreshed. */
export function buildDetails(id: string): Promise<HackathonDetails> {
  const pending = building.get(id);
  if (pending) return pending;
  const job = (async () => {
    const h = await getHackathon(id);
    if (!h) throw new Error("Unknown hackathon");
    const sourceText = await gatherSourceText(h);
    let info: HackathonInfo | null = null;
    let provider: string | null = null;
    let error: string | null = null;
    if (sourceText.length < 80) {
      error = "This listing has almost no detail to read. Open the hackathon page for the full rules.";
    } else {
      try {
        const res = await generateJson<HackathonInfo>({
          task: "extract",
          system: EXTRACT_PROMPT,
          messages: [{ role: "user", content: `${factsBlock(h)}\n\n--- PAGE TEXT ---\n${sourceText}` }],
          temperature: 0.1,
          geminiTimeoutMs: 90_000,
          // Same page text, same answer: a refresh of an unchanged page, or a retry after a failure, costs nothing.
          cache: { ttlDays: 30 },
        });
        info = res.data;
        provider = `${res.provider}:${res.model}`;
      } catch (e) {
        error = e instanceof AiUnavailableError ? e.message : `AI extraction failed: ${(e as Error).message}`;
      }
    }
    (await run(`INSERT INTO hackathon_details (hackathon_id, source_text, info, provider, error, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(hackathon_id) DO UPDATE SET source_text = excluded.source_text, info = excluded.info,
           provider = excluded.provider, error = excluded.error, fetched_at = excluded.fetched_at`, id, sourceText, info ? JSON.stringify(info) : null, provider, error, new Date().toISOString()));
    return (await getDetails(id))!;
  })().finally(() => {
    building.delete(id);
    void run("DELETE FROM app_settings WHERE key = ?", READING_KEY(id)).catch(() => {});
  });
  building.set(id, job);
  return job;
}

// ---------- Q&A chat ----------

export async function listChat(id: string): Promise<ChatMessage[]> {
  const rows = (await all("SELECT id, role, content, provider, created_at AS createdAt, citations, not_found AS notFound, follow_ups AS followUps FROM chat_messages WHERE hackathon_id = ? ORDER BY id", id)) as unknown as (Omit<ChatMessage, "citations" | "notFound" | "followUps"> & { citations: string | null; notFound: number; followUps: string | null })[];
  return rows.map((r) => ({
    ...r,
    citations: r.citations ? (JSON.parse(r.citations) as Citation[]) : [],
    notFound: r.notFound === 1,
    followUps: r.followUps ? (JSON.parse(r.followUps) as string[]) : [],
  }));
}

export async function clearChat(id: string) {
  (await run("DELETE FROM chat_messages WHERE hackathon_id = ?", id));
}

export async function askQuestion(id: string, question: string): Promise<ChatMessage[]> {
  const h = await getHackathon(id);
  if (!h) throw new Error("Unknown hackathon");
  const details = await getDetails(id) ?? (await buildDetails(id));
  const history = (await listChat(id)).slice(-10);
  const now = new Date().toISOString();
  const passages = relevantPassages(await getSourceText(id), question);
  const system = `You are HackMate, helping someone decide on and prepare for one hackathon. Answer using ONLY the hackathon information below.
If the answer isn't in it, say so plainly and suggest where to check (the hackathon page, organizers' Discord/email). Quote exact limits, dates and rules when they matter.
Be brief: a direct answer first, then short bullets if useful. Current time: ${now}.

Cite the page: after each claim that comes from a numbered passage, put its marker, e.g. "Teams can have up to 4 people [P3]."
Only cite passages that really say it. Facts and extracted info have no markers; don't invent any.
Reply as JSON: {"answer": "your answer with [P#] markers", "quotes": {"P3": "the exact sentence from P3 you relied on, copied word for word"}, "notFound": false, "followUps": ["..."]}
Set "notFound" to true when the information below doesn't answer the question.
"followUps": up to 3 short questions (under 60 characters) this person would likely ask next and that the information below can answer.

=== FACTS ===
${factsBlock(h)}

=== EXTRACTED INFO ===
${details.info ? JSON.stringify(details.info) : "(not available)"}

=== PAGE PASSAGES ===
${passagesBlock(passages)}`;
  // Past answers carry display markers ([1]); drop them so the model only ever sees and writes [P#].
  const messages = [...history.map((m) => ({ role: m.role, content: m.content.replace(/\s*\[\d+\]/g, "") })), { role: "user" as const, content: question }];

  let answer: string;
  let quotes: Record<string, string> | undefined;
  let notFound = false;
  let followUps: string[] = [];
  let res: { provider: string; model: string };
  try {
    // An opening question about a hackathon ("max team size?") gets the same answer for everyone, so it's
    // shared. Keyed on the question and the page it's answered from, not the prompt (which has the time in it).
    const firstQuestion = history.length === 0;
    const pageHash = createHash("sha256").update(await getSourceText(id)).update(JSON.stringify(details.info ?? null)).digest("hex").slice(0, 16);
    const asked = question.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const r = await generateJson<{ answer?: string; quotes?: Record<string, string>; notFound?: boolean; followUps?: unknown }>({
      task: "chat",
      system,
      messages,
      temperature: 0.2,
      ...(firstQuestion && { cache: { ttlDays: 7, key: `${id}:${pageHash}:${asked}` } }),
    });
    if (!r.data.answer?.trim()) throw new Error("empty answer");
    ({ answer, quotes } = { answer: r.data.answer, quotes: r.data.quotes });
    notFound = r.data.notFound === true;
    followUps = Array.isArray(r.data.followUps)
      ? r.data.followUps.filter((q): q is string => typeof q === "string" && q.trim().length > 3).map((q) => q.trim().slice(0, 100)).slice(0, 3)
      : [];
    res = r;
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    // The model didn't return usable JSON: ask again in plain text and keep any markers it used.
    const r = await generate({ task: "chat", system, messages, temperature: 0.2 });
    answer = r.text;
    res = r;
  }
  const { content, citations } = resolveCitations(answer.trim(), quotes, passages);

  const insert = stmt("INSERT INTO chat_messages (hackathon_id, role, content, provider, created_at, citations, not_found, follow_ups) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",);
  await insert.run(id, "user", question, null, now, null, 0, null);
  await insert.run(id, "assistant", content, `${res.provider}:${res.model}`, new Date().toISOString(), JSON.stringify(citations), notFound ? 1 : 0, JSON.stringify(followUps));
  return listChat(id);
}

// ---------- past winners ----------

interface DevfolioProject {
  name: string;
  tagline: string | null;
  slug: string;
  hackathon?: { name?: string } | null;
  prizes?: { name: string }[];
  hashtags?: { name: string }[];
}

async function searchDevfolioWinners(q: string, size = 8): Promise<WinnerProject[]> {
  const res = await fetchJson<{ hits: { hits: { _source: DevfolioProject }[] } }>("https://api.devfolio.co/api/search/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, filter: "winners", from: 0, size }),
  });
  return res.hits.hits.map(({ _source: p }) => ({
    name: p.name,
    tagline: p.tagline,
    hackathon: p.hackathon?.name ?? null,
    prizes: (p.prizes ?? []).map((x) => x.name),
    url: `https://devfolio.co/projects/${p.slug}`,
    tags: (p.hashtags ?? []).map((t) => t.name).slice(0, 6),
  }));
}

const WINNERS_TTL_MS = 3 * 86_400_000;

/**
 * Prize-winning projects that are most likely to be relevant: earlier editions of this same
 * hackathon first (matched on its name without the year/edition), then winners in the same themes.
 */
export async function pastWinners(id: string, refresh = false): Promise<WinnerProject[]> {
  const cached = (await get("SELECT projects, fetched_at FROM past_winners WHERE hackathon_id = ?", id)) as
    | { projects: string; fetched_at: string }
    | undefined;
  if (cached && !refresh && Date.now() - new Date(cached.fetched_at).getTime() < WINNERS_TTL_MS) {
    return JSON.parse(cached.projects);
  }
  const h = await getHackathon(id);
  if (!h) throw new Error("Unknown hackathon");
  const stem = h.title.replace(/\b(20\d\d|\d+(\.\d+)?|v\d+|[ivx]+|edition|season)\b/gi, "").replace(/[^\w\s&]/g, " ").replace(/\s+/g, " ").trim();
  const queries = [stem, ...h.themes.slice(0, 2).map((t) => t.replace(/ \/ .*/, ""))].filter((q) => q.length > 2);
  const seen = new Set<string>();
  const projects: WinnerProject[] = [];
  for (const q of queries) {
    try {
      for (const p of await searchDevfolioWinners(q)) {
        if (seen.has(p.url)) continue;
        seen.add(p.url);
        projects.push(p);
      }
    } catch (e) {
      console.warn("[winners]", q, (e as Error).message);
    }
  }
  const top = projects.slice(0, 16);
  (await run(`INSERT INTO past_winners (hackathon_id, projects, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(hackathon_id) DO UPDATE SET projects = excluded.projects, fetched_at = excluded.fetched_at`, id, JSON.stringify(top), new Date().toISOString()));
  return top;
}

export { factsBlock };
