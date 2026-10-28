import { withAccount } from "@/lib/auth";
import { currentScope } from "@/lib/db";
import { runReminders } from "@/lib/reminders";
import { allow, tooMany } from "@/lib/request";

/**
 * Check your due reminders now (the server also does this for everyone every 5 minutes). It only ever sends
 * what's due, once, so pressing it again does nothing new; the limit just stops it being hammered.
 */
async function post() {
  if (!await allow(`reminders:${currentScope() ?? "local"}`, 10, 3_600_000)) return tooMany("Checked a lot already this hour. The server checks every 5 minutes anyway.");
  return Response.json(await runReminders());
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
