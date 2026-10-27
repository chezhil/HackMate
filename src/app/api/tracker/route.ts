import { getHackathon, listTracked, trackHackathon } from "@/lib/repo";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ tracked: listTracked() });
}

/** Pin a hackathon to the tracker. Body: { hackathonId } */
export async function POST(req: Request) {
  const { hackathonId } = (await req.json()) as { hackathonId?: string };
  if (!hackathonId || !getHackathon(hackathonId)) {
    return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  }
  trackHackathon(hackathonId);
  return Response.json({ tracked: listTracked() });
}
