import { lastSync, syncAll } from "@/lib/sync";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ lastSync: lastSync() });
}

export async function POST() {
  const report = await syncAll();
  return Response.json(report);
}
