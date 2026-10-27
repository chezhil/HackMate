import { runReminders } from "@/lib/reminders";

/** Check for due reminders now (the server also does this every 5 minutes). */
export async function POST() {
  return Response.json(await runReminders());
}
