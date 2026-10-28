import { withAccount } from "@/lib/auth";
import { deleteStandup, listStandups, standupHackathon } from "@/lib/standups";

type Ctx = { params: Promise<{ standupId: string }> };

async function remove(_req: Request, { params }: Ctx) {
  const standupId = Number((await params).standupId);
  const hackathonId = standupHackathon(standupId);
  deleteStandup(standupId);
  return Response.json({ standups: hackathonId ? listStandups(hackathonId) : [] });
}

// Every request reads and writes the signed-in person's own data.
export const DELETE = withAccount(remove);
