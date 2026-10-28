import { startReminderLoop } from "./lib/reminders";
import { isStale, syncAll } from "./lib/sync";

// Background jobs while a server of your own runs: email reminders every 5 min, feed refresh when stale.
// Vercel has no long-running server; there /api/cron does the same on a schedule.
if (!process.env.VERCEL) {
  startReminderLoop();

  const g = globalThis as unknown as { hackmateSyncLoop?: boolean };
  if (!g.hackmateSyncLoop) {
    g.hackmateSyncLoop = true;
    setInterval(() => {
      void isStale().then((stale) => (stale ? syncAll() : undefined)).catch((e) => console.error("[sync]", e));
    }, 30 * 60_000).unref();
  }
}
