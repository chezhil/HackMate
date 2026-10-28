import { background } from "@/lib/request";
import { withAccount } from "@/lib/auth";
import { listHackathons, listTracked } from "@/lib/repo";
import { isStale, lastSync, needsInitialSync, syncAll } from "@/lib/sync";
import { connection } from "next/server";

async function get() {
  await connection();
  if (await needsInitialSync()) {
    await syncAll(); // first run: wait so the user doesn't land on an empty page
  } else if (await isStale()) {
    background("sync", syncAll);
  }
  return Response.json({
    hackathons: await listHackathons(),
    tracked: await listTracked(),
    lastSync: await lastSync(),
  });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
