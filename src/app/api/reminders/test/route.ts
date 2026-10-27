import { sendEmail } from "@/lib/mailer";
import { getSettings } from "@/lib/settings";

export async function POST() {
  const { email } = getSettings();
  if (!email) return Response.json({ error: "Set an email address first" }, { status: 400 });
  const res = await sendEmail(email, "HackMate test email", "If you can read this, HackMate reminders will reach you. 🎉");
  return Response.json(res);
}
