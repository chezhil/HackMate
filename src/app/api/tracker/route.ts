import { getHackathon, listTracked, trackHackathon } from "@/lib/repo";
import { connection } from "next/server";
import { readJson, text } from "@/lib/validation";

export async function GET() {
  await connection();
  return Response.json({ tracked: listTracked() });
}

/** Pin a hackathon to the tracker. Body: { hackathonId } */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const { hackathonId } = body;
  if (!text(hackathonId) || !getHackathon(hackathonId)) {
    return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  }
  trackHackathon(hackathonId);
  return Response.json({ tracked: listTracked() });
}
