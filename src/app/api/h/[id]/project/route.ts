import { withAccount } from "@/lib/auth";
import { getHackathon } from "@/lib/repo";
import { badRequest, isHttpUrl, readJson, text, validFields } from "@/lib/validation";
import { getProject, saveProject } from "@/lib/project";
import type { Project } from "@/lib/types";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

async function get(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  return Response.json({ project: getProject(id) });
}

async function put(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, { name: text, tagline: text, problem: text, solution: text, stack: text, repoUrl: text, demoUrl: text, videoUrl: text })) return badRequest("Invalid project fields");
  if ((body.repoUrl !== undefined && body.repoUrl !== "" && !isHttpUrl(body.repoUrl)) || (body.demoUrl !== undefined && body.demoUrl !== "" && !isHttpUrl(body.demoUrl)) || (body.videoUrl !== undefined && body.videoUrl !== "" && !isHttpUrl(body.videoUrl))) return badRequest("Enter valid http:// or https:// project links");
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => ['name', 'tagline', 'problem', 'solution', 'stack', 'repoUrl', 'demoUrl', 'videoUrl'].includes(key))) as Partial<Project>;
  return Response.json({ project: saveProject(id, patch) });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const PUT = withAccount(put);
