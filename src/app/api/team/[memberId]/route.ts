import { listTeam, removeTeammate, teamOf, updateTeammate } from "@/lib/team";
import type { Teammate } from "@/lib/types";
import { badRequest, boolean, nullableText, readJson, text, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ memberId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const memberId = Number((await params).memberId);
  const hackathonId = teamOf(memberId);
  if (!hackathonId) return Response.json({ error: "Teammate not found" }, { status: 404 });
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, { name: (v) => text(v) && Boolean(v.trim()), role: nullableText, skills: nullableText, contact: nullableText, confirmed: boolean })) return badRequest("Invalid teammate fields");
  updateTeammate(memberId, body as Partial<Teammate>);
  return Response.json({ team: listTeam(hackathonId) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const memberId = Number((await params).memberId);
  const hackathonId = teamOf(memberId);
  removeTeammate(memberId);
  return Response.json({ team: hackathonId ? listTeam(hackathonId) : [] });
}
