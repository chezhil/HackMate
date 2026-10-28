import "server-only";
import { allScopes, currentScope, runAs, stmt } from "./db";
import { sendEmail } from "./mailer";
import { listUpcomingDeadlines } from "./repo";
import { getSettings, smtpConfigured } from "./settings";

/** "2 days 4 hours", "3 hours", "45 minutes" */
function timeLeft(ms: number) {
  const mins = Math.round(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days > 0) return hours > 0 ? `${plural(days, "day")} ${plural(hours, "hour")}` : plural(days, "day");
  if (hours > 0) return plural(hours, "hour");
  return plural(mins, "minute");
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: process.env.TZ || undefined });
}

/**
 * Send any reminder whose window has opened: for each open deadline and each lead time,
 * once `now >= due - lead` (and the deadline hasn't passed) we email once and record it.
 * Keyed on due_at too, so moving a deadline re-arms its reminders.
 */
// One run at a time per account (or signed out); each sends to that account's own email setting.
const inFlight = new Map<number | null, Promise<{ sent: number; skipped?: string }>>();
export function runReminders(now = new Date()): Promise<{ sent: number; skipped?: string }> {
  const who = currentScope();
  let run = inFlight.get(who);
  if (!run) {
    run = sendDueReminders(now).finally(() => inFlight.delete(who));
    inFlight.set(who, run);
  }
  return run;
}

async function sendDueReminders(now: Date): Promise<{ sent: number; skipped?: string }> {
  const settings = await getSettings();
  if (!settings.remindersEnabled) return { sent: 0, skipped: "Reminders are turned off" };
  if (!settings.email) return { sent: 0, skipped: "No email address set" };

  const already = stmt("SELECT 1 AS one FROM reminders_sent WHERE deadline_id = ? AND lead_minutes = ? AND due_at = ?");
  const mark = stmt("INSERT INTO reminders_sent (deadline_id, lead_minutes, due_at, sent_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING");

  // Group everything due now into one email rather than spamming one per deadline.
  const due: { line: string; mark: () => Promise<void> }[] = [];
  for (const d of await listUpcomingDeadlines()) {
    const dueAt = new Date(d.dueAt);
    if (dueAt <= now) continue;
    // Only the tightest lead time whose window is open, so a newly tracked hackathon
    // due tomorrow gets one "1 day before" email, not the week + 3-day ones as well.
    const open = settings.leadMinutes.filter((m) => now.getTime() >= dueAt.getTime() - m * 60_000);
    if (open.length === 0) continue;
    const tightest = Math.min(...open);
    if (await already.get(d.id, tightest, d.dueAt)) continue;
    due.push({
      line: `• ${d.hackathonTitle} — ${d.label}: ${fmt(d.dueAt)} (${timeLeft(dueAt.getTime() - now.getTime())} left)\n  ${d.hackathonUrl}`,
      mark: async () => {
        for (const m of open) await mark.run(d.id, m, d.dueAt, now.toISOString());
      },
    });
  }
  if (due.length === 0) return { sent: 0 };

  const subject = due.length === 1 ? `HackMate: 1 deadline coming up` : `HackMate: ${due.length} deadlines coming up`;
  const body = `Heads up! These deadlines are coming up:\n\n${due.map((d) => d.line).join("\n\n")}\n\n— HackMate`;
  const res = await sendEmail(settings.email, subject, body);
  // Without SMTP the email only goes to the outbox log; mark it handled so the log doesn't fill
  // with repeats. A real send that failed is left unmarked and retried on the next tick.
  if (res.delivered || !smtpConfigured()) for (const d of due) await d.mark();
  return { sent: res.delivered ? due.length : 0, skipped: res.error };
}

const loop = globalThis as unknown as { hackmateReminderLoop?: boolean };

/** Everyone's reminders: from the loop below on a server, or from the scheduled /api/cron call on Vercel. */
export async function runAllReminders() {
  let sent = 0;
  for (const id of await allScopes()) {
    try {
      sent += (await runAs(id, () => runReminders())).sent;
    } catch (e) {
      console.error("[reminders]", id ?? "signed out", e);
    }
  }
  return { sent };
}

/** Called from instrumentation: check reminders every 5 minutes while the server is running. */
export function startReminderLoop() {
  if (loop.hackmateReminderLoop) return;
  loop.hackmateReminderLoop = true;
  const tick = () => void runAllReminders();
  setTimeout(tick, 10_000);
  setInterval(tick, 5 * 60_000).unref();
}
