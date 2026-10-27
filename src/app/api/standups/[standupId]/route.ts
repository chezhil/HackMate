import { deleteStandup, listStandups, standupHackathon } from "@/lib/standups";

type Ctx = { params: Promise<{ standupId: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const standupId = Number((await params).standupId);
  const hackathonId = standupHackathon(standupId);
  deleteStandup(standupId);
  return Response.json({ standups: hackathonId ? listStandups(hackathonId) : [] });
}
