import { withAccount } from "@/lib/auth";
import { listTeam, removeTeammate, teamOf, updateTeammate } from "@/lib/team";
import type { Teammate } from "@/lib/types";
import { badRequest, boolean, nullableText, readJson, text, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ memberId: string }> };

async function patch(req: Request, { params }: Ctx) {
  const memberId = Number((await params).memberId);
  const hackathonId = teamOf(memberId);
  if (!hackathonId) return Response.json({ error: "Teammate not found" }, { status: 404 });
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, { name: (v) => text(v) && Boolean(v.trim()), role: nullableText, skills: nullableText, contact: nullableText, confirmed: boolean })) return badRequest("Invalid teammate fields");
  updateTeammate(memberId, body as Partial<Teammate>);
  return Response.json({ team: listTeam(hackathonId) });
}

async function remove(_req: Request, { params }: Ctx) {
  const memberId = Number((await params).memberId);
  const hackathonId = teamOf(memberId);
  removeTeammate(memberId);
  return Response.json({ team: hackathonId ? listTeam(hackathonId) : [] });
}

// Every request reads and writes the signed-in person's own data.
export const PATCH = withAccount(patch);
export const DELETE = withAccount(remove);
