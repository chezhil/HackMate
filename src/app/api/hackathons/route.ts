import { withAccount } from "@/lib/auth";
import { listHackathons, listTracked } from "@/lib/repo";
import { isStale, lastSync, needsInitialSync, syncAll } from "@/lib/sync";
import { connection } from "next/server";

async function get() {
  await connection();
  if (needsInitialSync()) {
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

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
