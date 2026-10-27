import { listStandups, standupHackathon, transcribeStandup } from "@/lib/standups";

type Ctx = { params: Promise<{ standupId: string }> };

/** Retry transcription (e.g. after adding an API key or after a rate limit). */
export async function POST(_req: Request, { params }: Ctx) {
  const standupId = Number((await params).standupId);
  const hackathonId = standupHackathon(standupId);
  if (!hackathonId) return Response.json({ error: "Not found" }, { status: 404 });
  await transcribeStandup(standupId);
  return Response.json({ standups: listStandups(hackathonId) });
}
