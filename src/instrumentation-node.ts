import { startReminderLoop } from "./lib/reminders";
import { isStale, syncAll } from "./lib/sync";

// Background jobs while the server runs: email reminders every 5 min, feed refresh when stale.
startReminderLoop();

const g = globalThis as unknown as { hackmateSyncLoop?: boolean };
if (!g.hackmateSyncLoop) {
  g.hackmateSyncLoop = true;
  setInterval(() => {
    if (isStale()) syncAll().catch((e) => console.error("[sync]", e));
  }, 30 * 60_000).unref();
}
