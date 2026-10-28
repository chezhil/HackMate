import { withAccount } from "@/lib/auth";
import { getHackathon, listTracked, trackHackathon } from "@/lib/repo";
import { connection } from "next/server";
import { readJson, text } from "@/lib/validation";

async function get() {
  await connection();
  return Response.json({ tracked: listTracked() });
}

/** Pin a hackathon to the tracker. Body: { hackathonId } */
async function post(req: Request) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const { hackathonId } = body;
  if (!text(hackathonId) || !getHackathon(hackathonId)) {
    return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  }
  trackHackathon(hackathonId);
  return Response.json({ tracked: listTracked() });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
