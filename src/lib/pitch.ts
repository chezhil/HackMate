import "server-only";
import { generateJson } from "./ai";
import { all, get, run } from "./db";
import { factsBlock, getDetails } from "./details";
import { projectBlock } from "./project";
import { getHackathon } from "./repo";
import type { AiOutput, AiOutputKind, DeckRoast, PitchScript, QaGrade, QaTurn, VideoScript, Writeup } from "./types";

async function context(hackathonId: string) {
  const h = await getHackathon(hackathonId);
  if (!h) throw new Error("Unknown hackathon");
  const info = (await getDetails(hackathonId))?.info;
  const rules = [
    `Judging criteria: ${JSON.stringify(info?.judgingCriteria ?? [])}`,
    `Tracks: ${JSON.stringify(info?.tracks ?? [])}`,
    `Deliverables: ${JSON.stringify(info?.deliverables ?? [])}`,
    `Judges: ${JSON.stringify(info?.judges ?? [])}`,
  ].join("\n");
  return { h, info, text: `${factsBlock(h)}\n${rules}\n\n${await projectBlock(hackathonId)}` };
}

async function save<T>(hackathonId: string, kind: AiOutputKind, params: Record<string, unknown>, content: T, provider: string): Promise<AiOutput<T>> {
  const r = (await get("INSERT INTO ai_outputs (hackathon_id, kind, params, content, provider, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, created_at", hackathonId, kind, JSON.stringify(params), JSON.stringify(content), provider, new Date().toISOString())) as { id: number; created_at: string };
  return { id: r.id, kind, params, content, provider, createdAt: r.created_at };
}

export async function listOutputs(hackathonId: string): Promise<AiOutput[]> {
  return (
    (await all("SELECT * FROM ai_outputs WHERE hackathon_id = ? ORDER BY id DESC LIMIT 60", hackathonId)) as Record<string, string | number>[]
  ).map((r) => ({
    id: r.id as number,
    kind: r.kind as AiOutputKind,
    params: JSON.parse(r.params as string),
    content: JSON.parse(r.content as string),
    provider: (r.provider as string) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function deleteOutput(id: number) {
  (await run("DELETE FROM ai_outputs WHERE id = ?", id));
}

/** Pull "2 minutes" / "90 seconds" style limits out of the deliverables, in seconds. */
export async function videoLimitSec(hackathonId: string): Promise<number | null> {
  const items = (await getDetails(hackathonId))?.info?.deliverables ?? [];
  const video = items.find((d) => /video|demo/i.test(d.item));
  const text = `${video?.item ?? ""} ${video?.limit ?? ""}`;
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const m = text.match(/(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*-?\s*(min|minute|sec|second)/i);
  if (!m) return null;
  const n = words[m[1].toLowerCase()] ?? Number(m[1]);
  return /^sec/i.test(m[2]) ? n : n * 60;
}

// ---------- pitch & video script ----------

export async function generatePitch(hackathonId: string, minutes: number, audience: string) {
  const { text } = await context(hackathonId);
  const res = await generateJson<PitchScript>({
    task: "pitch",
    temperature: 0.6,
    system: `You write spoken hackathon pitches that win. Write a ${minutes}-minute pitch (~${Math.round(minutes * 140)} words spoken) for the project below, aimed at ${audience || "the judges"}.
Structure it to hit the judging criteria explicitly. Open with a hook (a story, a striking number or a live moment), then problem, solution, live-demo cue, how it works/tech, impact, and a close that asks for something.
Reply with JSON { "title": string, "hook": string (the first line), "sections": [{ "name": string, "seconds": number, "text": string (what to say, verbatim) }], "tips": string[] (3-5 delivery tips) }.
Section seconds must add up to about ${minutes * 60}. Never invent metrics or users; mark placeholders like [X users] for the team to fill in.`,
    messages: [{ role: "user", content: text }],
  });
  return save(hackathonId, "pitch", { minutes, audience }, res.data, `${res.provider}:${res.model}`);
}

export async function generateVideoScript(hackathonId: string, seconds: number) {
  const { text } = await context(hackathonId);
  const res = await generateJson<VideoScript>({
    task: "pitch",
    temperature: 0.6,
    system: `You storyboard hackathon demo videos. Write a ${seconds}-second demo video script for the project below; it MUST fit within ${seconds} seconds.
Show the product working early (by ~15% in), keep talking-head time minimal, end with what's next and a call to action. Respect any deliverable rules listed.
Reply with JSON { "title": string, "totalSeconds": number, "scenes": [{ "start": number, "end": number, "shot": string (what's on screen / what to record), "voiceover": string (verbatim narration), "onScreen": string (captions or text overlays) }], "tips": string[] (recording/editing tips) }.`,
    messages: [{ role: "user", content: text }],
  });
  return save(hackathonId, "video", { seconds }, res.data, `${res.provider}:${res.model}`);
}

// ---------- deck roaster ----------

export async function roastDeck(hackathonId: string, script: string) {
  const { text } = await context(hackathonId);
  const res = await generateJson<DeckRoast>({
    task: "roast",
    temperature: 0.3,
    system: `You are a tough but fair hackathon judge roasting a team's pitch script / deck text. Be specific and quote their words.
Reply with JSON { "score": 1-10, "verdict": string (one punchy sentence), "strengths": string[],
"weakPoints": [{ "issue": string, "quote": string|null (exact words from their script), "fix": string (concrete rewrite or action) }],
"missing": string[] (things judges expect that aren't there, tied to the judging criteria), "rewrittenOpening": string (a stronger first 2-3 sentences), "timing": string|null (estimate of spoken length vs. any limit) }.`,
    messages: [{ role: "user", content: `${text}\n\n--- THEIR PITCH / DECK TEXT ---\n${script}` }],
  });
  return save(hackathonId, "roast", { chars: script.length, excerpt: script.slice(0, 160) }, res.data, `${res.provider}:${res.model}`);
}

// ---------- social / dev write-ups ----------

const PLATFORM_RULES: Record<Writeup["platform"], string> = {
  linkedin:
    "A LinkedIn post (150-250 words): hook line, what we built and why, 2-4 short bullet highlights, thank the organizers/sponsors/teammates, links, 3-6 hashtags. Professional but human; at most 3 emojis.",
  x: "An X/Twitter thread of 4-6 posts, each under 270 characters, separated by a line containing only '---'. First post is the hook with the demo link. Tag-friendly, 1-2 hashtags total.",
  devto:
    "A dev.to / Hashnode blog post in Markdown (500-800 words): title as '# ...', intro, the problem, how we built it (architecture, stack, one interesting challenge with a code-level detail if known), what we learned, what's next, links. Use headings.",
};

export async function generateWriteup(hackathonId: string, platform: Writeup["platform"], extra: string) {
  const { text } = await context(hackathonId);
  const res = await generateJson<Writeup>({
    task: "writeup",
    temperature: 0.7,
    system: `You write posts developers share after a hackathon (many hackathons give prizes for the best post). Write: ${PLATFORM_RULES[platform]}
Only use facts given; mark anything unknown as [placeholder]. Reply with JSON { "platform": "${platform}", "text": string }.`,
    messages: [{ role: "user", content: `${text}${extra ? `\n\nExtra notes from the team: ${extra}` : ""}` }],
  });
  return save(hackathonId, "writeup", { platform }, res.data, `${res.provider}:${res.model}`);
}

// ---------- mock Q&A ----------

const QA_ROUNDS = 5;

function toTurn(r: Record<string, string | number | null>): QaTurn {
  return {
    id: r.id as number,
    session: r.session as number,
    judge: r.judge as string,
    question: r.question as string,
    answer: (r.answer as string) ?? null,
    grade: r.grade ? (JSON.parse(r.grade as string) as QaGrade) : null,
    createdAt: r.created_at as string,
  };
}

export async function listQa(hackathonId: string): Promise<QaTurn[]> {
  return ((await all("SELECT * FROM qa_turns WHERE hackathon_id = ? ORDER BY id", hackathonId)) as Record<string, string | number | null>[]).map(toTurn);
}

async function judgePanel(hackathonId: string): Promise<string> {
  const judges = (await getDetails(hackathonId))?.info?.judges ?? [];
  if (judges.length) return judges.slice(0, 4).map((j) => `${j.name}${j.title ? ` (${j.title})` : ""}`).join("; ");
  return "Priya (technical judge, staff engineer); Marcus (product/business judge, startup founder); Lena (design & UX judge)";
}

const QA_SYSTEM = (panel: string) => `You run a realistic mock judging Q&A for a hackathon. The panel: ${panel}.
Judges ask the hard questions real judges ask: technical depth, feasibility, what's actually built vs. mocked, differentiation, users/impact, business model, scalability, privacy/ethics, what they'd do with more time. Rotate judges; one question at a time; ground questions in the project and judging criteria.`;

async function insertTurn(hackathonId: string, session: number, q: { judge: string; question: string }) {
  (await run("INSERT INTO qa_turns (hackathon_id, session, judge, question, created_at) VALUES (?, ?, ?, ?, ?)", hackathonId, session, q.judge, q.question, new Date().toISOString()));
}

export async function startQa(hackathonId: string): Promise<QaTurn[]> {
  const { text } = await context(hackathonId);
  const last = (await get("SELECT MAX(session) AS s FROM qa_turns WHERE hackathon_id = ?", hackathonId)) as { s: number | null };
  const session = (last.s ?? 0) + 1;
  const res = await generateJson<{ judge: string; question: string }>({
    task: "qa",
    temperature: 0.7,
    system: `${QA_SYSTEM(await judgePanel(hackathonId))}\nAsk the opening question. Reply with JSON { "judge": string (name), "question": string }.`,
    messages: [{ role: "user", content: text }],
  });
  await insertTurn(hackathonId, session, res.data);
  return listQa(hackathonId);
}

/** Grade the answer to the open question and, unless the round is over, ask the next one. */
export async function answerQa(hackathonId: string, turnId: number, answer: string): Promise<QaTurn[]> {
  const turn = (await listQa(hackathonId)).find((t) => t.id === turnId);
  if (!turn) throw new Error("Question not found");
  if (turn.answer) throw new Error("Already answered");
  const { text } = await context(hackathonId);
  const sessionTurns = (await listQa(hackathonId)).filter((t) => t.session === turn.session);
  const isLast = sessionTurns.length >= QA_ROUNDS;
  const transcript = sessionTurns
    .filter((t) => t.answer)
    .map((t) => `${t.judge}: ${t.question}\nTeam: ${t.answer}`)
    .join("\n\n");

  const res = await generateJson<{ grade: QaGrade; next: { judge: string; question: string } | null }>({
    task: "qa",
    temperature: 0.4,
    system: `${QA_SYSTEM(await judgePanel(hackathonId))}
Grade the team's answer to the latest question like a coach: { "score": 1-10, "feedback": string (what worked / didn't, 2-3 sentences), "missed": string[] (points a great answer would make), "modelAnswer": string (a strong 3-5 sentence answer in the team's voice, using only facts about the project; mark unknowns as [placeholder]) }.
${isLast ? 'This was the final question: set "next" to null.' : 'Then ask the next question (a different judge, possibly a follow-up that probes a weak spot in the answer).'}
Reply with JSON { "grade": {...}, "next": { "judge": string, "question": string } | null }.`,
    messages: [
      {
        role: "user",
        content: `${text}\n\n${transcript ? `Earlier in this Q&A:\n${transcript}\n\n` : ""}Latest question (${turn.judge}): ${turn.question}\nTeam's answer: ${answer}`,
      },
    ],
  });
  (await run("UPDATE qa_turns SET answer = ?, grade = ? WHERE id = ?", answer, JSON.stringify(res.data.grade), turnId));
  if (!isLast && res.data.next) await insertTurn(hackathonId, turn.session, res.data.next);
  return listQa(hackathonId);
}

export async function clearQa(hackathonId: string) {
  (await run("DELETE FROM qa_turns WHERE hackathon_id = ?", hackathonId));
}

export { QA_ROUNDS };
