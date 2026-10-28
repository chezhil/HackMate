import "server-only";
import { generateJson } from "./ai";
import { all, get, run } from "./db";
import { factsBlock, getDetails, pastWinners } from "./details";
import { getHackathon } from "./repo";
import type { Idea, IdeaCritique, IdeaSuggestion, IdeaVersion } from "./types";

async function context(id: string) {
  const h = await getHackathon(id);
  if (!h) throw new Error("Unknown hackathon");
  const info = (await getDetails(id))?.info;
  return { h, info };
}

function winnersBlock(winners: Awaited<ReturnType<typeof pastWinners>>) {
  if (!winners.length) return "(none found)";
  return winners
    .slice(0, 12)
    .map((w) => `- ${w.name}${w.tagline ? ` — ${w.tagline}` : ""}${w.hackathon ? ` [${w.hackathon}${w.prizes[0] ? `, ${w.prizes[0]}` : ""}]` : ""}`)
    .join("\n");
}

// ---------- suggestions ----------

export interface SuggestResult {
  guidelines: string[];
  ideas: IdeaSuggestion[];
  provider: string;
}

export async function suggestIdeas(id: string, interests: string): Promise<SuggestResult> {
  const { h, info } = await context(id);
  const winners = await pastWinners(id).catch(() => []);
  const res = await generateJson<{ guidelines: string[]; ideas: IdeaSuggestion[] }>({
    task: "ideas",
    temperature: 0.8,
    system: `You are a hackathon coach. Using the hackathon's tracks, judging criteria and what has won before, give:
- "guidelines": 4-6 short, specific rules of thumb for picking an idea that scores well at THIS hackathon (reference its criteria/tracks/sponsors).
- "ideas": 5 distinct project ideas buildable by a small team within the event, each { "title", "pitch" (2 sentences), "whyItCouldWin" (tie to criteria/tracks), "track" (string|null), "stack" (3-5 technologies) }.
Avoid copying past winners; learn from what made them win. Reply with JSON { "guidelines": string[], "ideas": [...] }.`,
    messages: [
      {
        role: "user",
        content: `${factsBlock(h)}

Tracks: ${JSON.stringify(info?.tracks ?? [])}
Judging criteria: ${JSON.stringify(info?.judgingCriteria ?? [])}
Prizes: ${JSON.stringify(info?.prizes ?? [])}
Summary: ${info?.summary ?? h.tagline ?? ""}

Past winning projects (this series and similar themes):
${winnersBlock(winners)}

${interests ? `Our interests / skills: ${interests}` : ""}`,
      },
    ],
  });
  return { ...res.data, provider: `${res.provider}:${res.model}` };
}

// ---------- saved ideas + critique iterations ----------

async function versionsFor(ideaId: number): Promise<IdeaVersion[]> {
  return (
    (await all("SELECT id, text, critique, provider, created_at FROM idea_versions WHERE idea_id = ? ORDER BY id", ideaId)) as { id: number; text: string; critique: string | null; provider: string | null; created_at: string }[]
  ).map((v) => ({
    id: v.id,
    text: v.text,
    critique: v.critique ? (JSON.parse(v.critique) as IdeaCritique) : null,
    provider: v.provider,
    createdAt: v.created_at,
  }));
}

export async function listIdeas(hackathonId: string): Promise<Idea[]> {
  const rows = (await all("SELECT id, hackathon_id, title, created_at FROM ideas WHERE hackathon_id = ? ORDER BY id DESC", hackathonId)) as { id: number; hackathon_id: string; title: string; created_at: string }[];
  return Promise.all(rows.map(async (r) => ({ id: r.id, hackathonId: r.hackathon_id, title: r.title, createdAt: r.created_at, versions: await versionsFor(r.id) })));
}

export async function createIdea(hackathonId: string, title: string, text: string): Promise<number> {
  const now = new Date().toISOString();
  const r = (await get("INSERT INTO ideas (hackathon_id, title, created_at) VALUES (?, ?, ?) RETURNING id", hackathonId, title.trim() || "Untitled idea", now)) as { id: number };
  (await run("INSERT INTO idea_versions (idea_id, text, created_at) VALUES (?, ?, ?)", r.id, text, now));
  return r.id;
}

export async function deleteIdea(ideaId: number) {
  (await run("DELETE FROM idea_versions WHERE idea_id = ?", ideaId));
  (await run("DELETE FROM ideas WHERE id = ?", ideaId));
}

export async function renameIdea(ideaId: number, title: string) {
  (await run("UPDATE ideas SET title = ? WHERE id = ?", title, ideaId));
}

/**
 * Save the idea's new text as a version and critique it against this hackathon. Earlier versions
 * and their critiques are passed along so feedback tracks what changed.
 */
export async function critiqueIdea(ideaId: number, text: string): Promise<Idea> {
  const idea = (await get("SELECT hackathon_id, title FROM ideas WHERE id = ?", ideaId)) as
    | { hackathon_id: string; title: string }
    | undefined;
  if (!idea) throw new Error("Idea not found");
  const { h, info } = await context(idea.hackathon_id);
  const winners = await pastWinners(idea.hackathon_id).catch(() => []);
  const previous = (await versionsFor(ideaId)).filter((v) => v.critique).slice(-2);

  const res = await generateJson<IdeaCritique>({
    task: "critique",
    temperature: 0.3,
    system: `You are a blunt, constructive hackathon judge. Critique the team's idea for THIS hackathon. Reply with JSON:
{ "score": 1-10, "verdict": one sentence, "positives": string[], "negatives": string[], "risks": string[] (build/demo risks for the time available),
  "suggestions": string[] (concrete changes that would raise the score), "criteriaFit": [{ "criterion", "score": 1-10, "note" }] (one per judging criterion; use Innovation/Impact/Technical complexity/Design/Presentation if none are given) }
Compare against past winners for originality. If earlier versions are given, say in the verdict whether this version improved and why.`,
    messages: [
      {
        role: "user",
        content: `${factsBlock(h)}
Tracks: ${JSON.stringify(info?.tracks ?? [])}
Judging criteria: ${JSON.stringify(info?.judgingCriteria ?? [])}
Deliverables: ${JSON.stringify(info?.deliverables ?? [])}

Past winners:
${winnersBlock(winners)}

${previous.length ? `Earlier versions:\n${previous.map((v, i) => `v${i + 1} (score ${v.critique!.score}): ${v.text}`).join("\n")}\n` : ""}
Idea "${idea.title}":
${text}`,
      },
    ],
  });

  const latest = (await versionsFor(ideaId)).at(-1);
  const provider = `${res.provider}:${res.model}`;
  if (latest && !latest.critique && latest.text === text) {
    // first critique of the text the idea was created with: attach it instead of duplicating
    (await run("UPDATE idea_versions SET critique = ?, provider = ? WHERE id = ?", JSON.stringify(res.data), provider, latest.id));
  } else {
    (await run("INSERT INTO idea_versions (idea_id, text, critique, provider, created_at) VALUES (?, ?, ?, ?, ?)", ideaId, text, JSON.stringify(res.data), provider, new Date().toISOString()));
  }
  return (await listIdeas(idea.hackathon_id)).find((i) => i.id === ideaId)!;
}
