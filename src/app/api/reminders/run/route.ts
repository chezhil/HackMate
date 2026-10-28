import { withAccount } from "@/lib/auth";
import { runReminders } from "@/lib/reminders";

/** Check for due reminders now (the server also does this every 5 minutes). */
async function post() {
  return Response.json(await runReminders());
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
