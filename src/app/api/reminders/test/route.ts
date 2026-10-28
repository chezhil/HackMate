import { withAccount } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { currentScope } from "@/lib/db";
import { allow, tooMany } from "@/lib/request";
import { getSettings } from "@/lib/settings";

async function post() {
  const { email } = await getSettings();
  // It sends real email, so a few an hour is plenty.
  if (!await allow(`test-email:${currentScope() ?? "local"}`, 3, 3_600_000)) return tooMany("You've sent 3 test emails this hour. Try again later.");
  if (!email) return Response.json({ error: "Set an email address first" }, { status: 400 });
  const res = await sendEmail(email, "HackMate test email", "If you can read this, HackMate reminders will reach you. 🎉");
  return Response.json(res);
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
