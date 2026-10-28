import { addTeammate, listTeam } from "@/lib/team";
import type { Teammate } from "@/lib/types";
import { connection } from "next/server";
import { getHackathon } from "@/lib/repo";
import { badRequest, boolean, nullableText, readJson, text, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ team: listTeam(decodeURIComponent((await params).id)) });
}

export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (!validFields(raw, { name: text, role: nullableText, skills: nullableText, contact: nullableText, confirmed: boolean })) return badRequest("Invalid teammate fields");
  const body = raw as Omit<Teammate, "id">;
  if (!body.name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });
  addTeammate(id, { ...body, confirmed: body.confirmed ?? true });
  return Response.json({ team: listTeam(id) });
}
