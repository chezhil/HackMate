import { withAccount } from "@/lib/auth";
import { getSettings, saveSettings, smtpConfigured } from "@/lib/settings";
import type { Settings } from "@/lib/types";
import { badRequest, boolean, readJson, validFields } from "@/lib/validation";
import { connection } from "next/server";

async function get() {
  await connection();
  return Response.json({ settings: getSettings(), smtpConfigured: smtpConfigured() });
}

async function put(req: Request) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, {
    email: (v) => typeof v === "string" && (v.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())),
    remindersEnabled: boolean,
    leadMinutes: (v) => Array.isArray(v) && v.length <= 20 && v.every((m) => Number.isSafeInteger(m) && m > 0 && m <= 525600),
    calendarProvider: (v) => ["google", "apple", "outlook", "other"].includes(v as string),
  })) return badRequest("Invalid settings");
  const settings = saveSettings({
    email: (body.email as string | undefined)?.trim(),
    remindersEnabled: body.remindersEnabled as boolean | undefined,
    leadMinutes: body.leadMinutes as number[] | undefined,
    calendarProvider: body.calendarProvider as Settings["calendarProvider"] | undefined,
  });
  return Response.json({ settings, smtpConfigured: smtpConfigured() });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const PUT = withAccount(put);
