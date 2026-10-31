import { runAllReminders } from "@/lib/reminders";
import { isStale, syncAll } from "@/lib/sync";
import { connection } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

// Compared as hashes, so the check takes the same time however much of a guess is right.
const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * The scheduled jobs, for hosts without a long-running server (Vercel): send everyone's due reminders and
 * refresh the feeds when they're stale. Called by Vercel Cron and by Supabase's scheduler every few minutes,
 * with CRON_SECRET as a bearer token; anyone else gets a 401.
 */
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || !timingSafeEqual(digest(req.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  const reminders = await runAllReminders();
  const synced = (await isStale()) ? (await syncAll()).at : null;
  return Response.json({ ok: true, reminders, synced });
}
