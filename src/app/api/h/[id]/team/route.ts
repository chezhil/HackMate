import { addTeammate, listTeam } from "@/lib/team";
import type { Teammate } from "@/lib/types";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ team: listTeam(decodeURIComponent((await params).id)) });
}

export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const body = (await req.json()) as Omit<Teammate, "id">;
  if (!body.name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });
  addTeammate(id, { ...body, confirmed: body.confirmed ?? true });
  return Response.json({ team: listTeam(id) });
}
