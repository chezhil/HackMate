import { withAccount } from "@/lib/auth";
import { lastSync, syncAll } from "@/lib/sync";
import { allow } from "@/lib/request";
import { connection } from "next/server";

async function get() {
  await connection();
  return Response.json({ lastSync: await lastSync() });
}

/**
 * Refresh every feed now. The feeds are shared, so however many people press Refresh, they're fetched at most
 * every few minutes; otherwise you get the last result. (The server also refreshes on its own every 30 minutes.)
 */
async function post() {
  const last = await lastSync();
  const recent = last && Date.now() - new Date(last.at).getTime() < 5 * 60_000;
  if (recent || !await allow("sync", 1, 5 * 60_000)) return Response.json({ ...(last ?? {}), skipped: "Refreshed in the last few minutes" });
  return Response.json(await syncAll());
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
