import { getProject, saveProject } from "@/lib/project";
import type { Project } from "@/lib/types";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ project: getProject(decodeURIComponent((await params).id)) });
}

export async function PUT(req: Request, { params }: Ctx) {
  const body = (await req.json()) as Partial<Project>;
  return Response.json({ project: saveProject(decodeURIComponent((await params).id), body) });
}
