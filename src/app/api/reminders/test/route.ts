import { withAccount } from "@/lib/auth";
import { sendEmail } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";

async function post() {
  const { email } = getSettings();
  if (!email) return Response.json({ error: "Set an email address first" }, { status: 400 });
  const res = await sendEmail(email, "HackMate test email", "If you can read this, HackMate reminders will reach you. 🎉");
  return Response.json(res);
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
