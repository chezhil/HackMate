import { listTeam, removeTeammate, teamOf, updateTeammate } from "@/lib/team";
import type { Teammate } from "@/lib/types";

type Ctx = { params: Promise<{ memberId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const memberId = Number((await params).memberId);
  const hackathonId = teamOf(memberId);
  if (!hackathonId) return Response.json({ error: "Teammate not found" }, { status: 404 });
  updateTeammate(memberId, (await req.json()) as Partial<Teammate>);
  return Response.json({ team: listTeam(hackathonId) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const memberId = Number((await params).memberId);
  const hackathonId = teamOf(memberId);
  removeTeammate(memberId);
  return Response.json({ team: hackathonId ? listTeam(hackathonId) : [] });
}
