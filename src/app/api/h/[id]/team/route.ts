import { withAccount } from "@/lib/auth";
import { addTeammate, listTeam } from "@/lib/team";
import type { Teammate } from "@/lib/types";
import { connection } from "next/server";
import { getHackathon } from "@/lib/repo";
import { badRequest, boolean, nullableText, readJson, text, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function get(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ team: await listTeam(decodeURIComponent((await params).id)) });
}

async function post(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!await getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (!validFields(raw, { name: text, role: nullableText, skills: nullableText, contact: nullableText, confirmed: boolean })) return badRequest("Invalid teammate fields");
  const body = raw as Omit<Teammate, "id">;
  if (!body.name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });
  await addTeammate(id, { ...body, confirmed: body.confirmed ?? true });
  return Response.json({ team: await listTeam(id) });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
