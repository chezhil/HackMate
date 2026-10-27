import { listHackathons, listTracked } from "@/lib/repo";
import { isStale, lastSync, syncAll } from "@/lib/sync";
import { connection } from "next/server";

export async function GET() {
  await connection();
  if (!lastSync()) {
    await syncAll(); // first run: wait so the user doesn't land on an empty page
  } else if (isStale()) {
    void syncAll();
  }
  return Response.json({
    hackathons: listHackathons(),
    tracked: listTracked(),
    lastSync: lastSync(),
  });
}
