import "server-only";
import { AiUnavailableError, generate, generateJson } from "./ai";
import { db } from "./db";
import { getDescription, getHackathon } from "./repo";
import { fetchJson, fetchText, htmlToText, USER_AGENT } from "./sources/util";
import type { ChatMessage, Hackathon, HackathonDetails, HackathonInfo, WinnerProject } from "./types";

const MAX_SOURCE_CHARS = 45_000;

// ---------- source text ----------

/** Everything we can read about a hackathon, as plain text, for the AI and the rule scanner. */
async function gatherSourceText(h: Hackathon): Promise<string> {
  const parts: string[] = [];
  const feedText = getDescription(h.id);
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
    } else if (h.source === "mlh" || h.source === "wemakedevs" || !feedText) {
      // MLH and WeMakeDevs listings carry almost no detail, so read the event's own page.
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
    `Source: ${h.source} (${h.url})`,
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

export function getDetails(id: string): HackathonDetails | null {
  const r = db().prepare("SELECT * FROM hackathon_details WHERE hackathon_id = ?").get(id);
  return r ? toDetails(r) : null;
}

export function getSourceText(id: string): string {
  const r = db().prepare("SELECT source_text FROM hackathon_details WHERE hackathon_id = ?").get(id) as { source_text: string } | undefined;
  return r?.source_text ?? getDescription(id) ?? "";
}

const building = new Map<string, Promise<HackathonDetails>>();

export function isBuilding(id: string) {
  return building.has(id);
}

/** Read the hackathon's page(s) and have the AI extract structured info. Cached until refreshed. */
export function buildDetails(id: string): Promise<HackathonDetails> {
  const pending = building.get(id);
  if (pending) return pending;
  const job = (async () => {
    const h = getHackathon(id);
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
        });
        info = res.data;
        provider = `${res.provider}:${res.model}`;
      } catch (e) {
        error = e instanceof AiUnavailableError ? e.message : `AI extraction failed: ${(e as Error).message}`;
      }
    }
    db()
      .prepare(
        `INSERT INTO hackathon_details (hackathon_id, source_text, info, provider, error, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(hackathon_id) DO UPDATE SET source_text = excluded.source_text, info = excluded.info,
           provider = excluded.provider, error = excluded.error, fetched_at = excluded.fetched_at`,
      )
      .run(id, sourceText, info ? JSON.stringify(info) : null, provider, error, new Date().toISOString());
    return getDetails(id)!;
  })().finally(() => building.delete(id));
  building.set(id, job);
  return job;
}

// ---------- Q&A chat ----------

const STOPWORDS = new Set("a an the is are was be can i we my our to of in on for and or do does how what when where who which with it this that there any if about".split(" "));

/**
 * The parts of the page most relevant to the question, so each chat request stays small enough
 * for Groq's free tier: paragraphs scored by how many of the question's words they contain.
 */
function relevantExcerpt(text: string, question: string, maxChars = 7_000): string {
  if (text.length <= maxChars) return text;
  const terms = question.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((t) => !STOPWORDS.has(t)) ?? [];
  const paras = text.split(/\n{2,}|\n(?=[•#-])/).map((p, i) => ({ p: p.trim(), i })).filter((x) => x.p.length > 20);
  const scored = paras.map((x) => {
    const lower = x.p.toLowerCase();
    return { ...x, score: terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0) + (x.i < 3 ? 0.5 : 0) };
  });
  const picked: typeof scored = [];
  let used = 0;
  for (const x of [...scored].sort((a, b) => b.score - a.score)) {
    if (used + x.p.length > maxChars) continue;
    picked.push(x);
    used += x.p.length;
  }
  return picked.sort((a, b) => a.i - b.i).map((x) => x.p).join("\n\n");
}

export function listChat(id: string): ChatMessage[] {
  return db()
    .prepare("SELECT id, role, content, provider, created_at AS createdAt FROM chat_messages WHERE hackathon_id = ? ORDER BY id")
    .all(id) as unknown as ChatMessage[];
}

export function clearChat(id: string) {
  db().prepare("DELETE FROM chat_messages WHERE hackathon_id = ?").run(id);
}

export async function askQuestion(id: string, question: string): Promise<ChatMessage[]> {
  const h = getHackathon(id);
  if (!h) throw new Error("Unknown hackathon");
  const details = getDetails(id) ?? (await buildDetails(id));
  const history = listChat(id).slice(-10);
  const now = new Date().toISOString();
  const res = await generate({
    task: "chat",
    system: `You are HackMate, helping someone decide on and prepare for one hackathon. Answer using ONLY the hackathon information below.
If the answer isn't in it, say so plainly and suggest where to check (the hackathon page, organizers' Discord/email). Quote exact limits, dates and rules when they matter.
Be brief: a direct answer first, then short bullets if useful. Current time: ${now}.

=== FACTS ===
${factsBlock(h)}

=== EXTRACTED INFO ===
${details.info ? JSON.stringify(details.info) : "(not available)"}

=== RELEVANT PAGE EXCERPTS ===
${relevantExcerpt(getSourceText(id), question) || "(none)"}`,
    messages: [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: question }],
    temperature: 0.2,
  });
  const insert = db().prepare("INSERT INTO chat_messages (hackathon_id, role, content, provider, created_at) VALUES (?, ?, ?, ?, ?)");
  insert.run(id, "user", question, null, now);
  insert.run(id, "assistant", res.text.trim(), `${res.provider}:${res.model}`, new Date().toISOString());
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
  const cached = db().prepare("SELECT projects, fetched_at FROM past_winners WHERE hackathon_id = ?").get(id) as
    | { projects: string; fetched_at: string }
    | undefined;
  if (cached && !refresh && Date.now() - new Date(cached.fetched_at).getTime() < WINNERS_TTL_MS) {
    return JSON.parse(cached.projects);
  }
  const h = getHackathon(id);
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
  db()
    .prepare(
      `INSERT INTO past_winners (hackathon_id, projects, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT(hackathon_id) DO UPDATE SET projects = excluded.projects, fetched_at = excluded.fetched_at`,
    )
    .run(id, JSON.stringify(top), new Date().toISOString());
  return top;
}

export { factsBlock };
