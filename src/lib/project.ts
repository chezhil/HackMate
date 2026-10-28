import "server-only";
import { get, run } from "./db";
import { listIdeas } from "./planning";
import { getHackathon, listTracked } from "./repo";
import { listTeam } from "./team";
import type { Project } from "./types";

type Row = Record<string, string>;

function toProject(r: Row): Project {
  return {
    hackathonId: r.hackathon_id,
    name: r.name,
    tagline: r.tagline,
    problem: r.problem,
    solution: r.solution,
    stack: r.stack,
    repoUrl: r.repo_url,
    demoUrl: r.demo_url,
    videoUrl: r.video_url,
    updatedAt: r.updated_at,
  };
}

/**
 * The project for a hackathon. Until the user saves one, it's prefilled from their latest idea
 * (title + text) and the submission link they gave the tracker.
 */
export async function getProject(hackathonId: string): Promise<Project> {
  const r = (await get("SELECT * FROM projects WHERE hackathon_id = ?", hackathonId)) as Row | undefined;
  if (r) return toProject(r);
  const idea = (await listIdeas(hackathonId))[0];
  const latest = idea?.versions.at(-1)?.text ?? "";
  const submission = (await listTracked()).find((t) => t.hackathonId === hackathonId)?.submissionUrl ?? "";
  const stack = latest.match(/Stack:\s*(.+)/i)?.[1] ?? "";
  return {
    hackathonId,
    name: idea?.title ?? "",
    tagline: "",
    problem: "",
    solution: latest.replace(/\n*Stack:[\s\S]*$/i, "").trim(),
    stack,
    repoUrl: /github\.com/.test(submission) ? submission : "",
    demoUrl: /github\.com/.test(submission) ? "" : submission,
    videoUrl: "",
    updatedAt: null,
  };
}

export async function saveProject(hackathonId: string, p: Partial<Project>): Promise<Project> {
  const cur = await getProject(hackathonId);
  const next = { ...cur, ...p };
  (await run(`INSERT INTO projects (hackathon_id, name, tagline, problem, solution, stack, repo_url, demo_url, video_url, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, hackathon_id) DO UPDATE SET name = excluded.name, tagline = excluded.tagline, problem = excluded.problem,
         solution = excluded.solution, stack = excluded.stack, repo_url = excluded.repo_url, demo_url = excluded.demo_url,
         video_url = excluded.video_url, updated_at = excluded.updated_at`, hackathonId, next.name.trim(), next.tagline.trim(), next.problem.trim(), next.solution.trim(), next.stack.trim(),
      next.repoUrl.trim(), next.demoUrl.trim(), next.videoUrl.trim(), new Date().toISOString(),));
  return getProject(hackathonId);
}

/** Everything the AI should know about what was built, as one text block. */
export async function projectBlock(hackathonId: string): Promise<string> {
  const p = await getProject(hackathonId);
  const h = await getHackathon(hackathonId);
  const team = (await listTeam(hackathonId)).filter((t) => t.confirmed);
  const result = (await listTracked()).find((t) => t.hackathonId === hackathonId);
  return [
    `Project: ${p.name || "(unnamed)"}`,
    p.tagline && `Tagline: ${p.tagline}`,
    p.problem && `Problem: ${p.problem}`,
    p.solution && `Solution: ${p.solution}`,
    p.stack && `Tech stack: ${p.stack}`,
    p.repoUrl && `Repo: ${p.repoUrl}`,
    p.demoUrl && `Live demo: ${p.demoUrl}`,
    p.videoUrl && `Demo video: ${p.videoUrl}`,
    team.length > 0 && `Team: me + ${team.map((t) => `${t.name}${t.role ? ` (${t.role})` : ""}`).join(", ")}`,
    result?.result && `Result: ${result.result}${result.resultNotes ? ` — ${result.resultNotes}` : ""}`,
    h && `Hackathon: ${h.title}${h.url ? ` (${h.url})` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}
