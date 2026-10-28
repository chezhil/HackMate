import { withAccount } from "@/lib/auth";
import { lastSync, syncAll } from "@/lib/sync";
import { connection } from "next/server";

async function get() {
  await connection();
  return Response.json({ lastSync: lastSync() });
}

async function post() {
  const report = await syncAll();
  return Response.json(report);
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
