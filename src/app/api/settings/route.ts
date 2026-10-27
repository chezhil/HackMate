import { getSettings, saveSettings, smtpConfigured } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ settings: getSettings(), smtpConfigured: smtpConfigured() });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<Settings>;
  const settings = saveSettings({
    email: body.email?.trim(),
    remindersEnabled: body.remindersEnabled,
    leadMinutes: body.leadMinutes,
    calendarProvider: body.calendarProvider,
  });
  return Response.json({ settings, smtpConfigured: smtpConfigured() });
}
