import "server-only";
import { calendarToken, getSetting, setSetting, withAccountLock } from "./db";
import type { Settings } from "./types";

type Preferences = Omit<Settings, "calendarToken">;

const DEFAULTS: Preferences = {
  email: "",
  remindersEnabled: true,
  leadMinutes: [24 * 60, 3 * 60],
  calendarProvider: "google",
};

async function getPreferences(): Promise<Preferences> {
  const raw = await getSetting("prefs");
  return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
}

export async function getSettings(): Promise<Settings> {
  return { ...await getPreferences(), calendarToken: await calendarToken() };
}

export async function saveSettings(patch: Partial<Preferences>): Promise<Settings> {
  return withAccountLock("settings:saveSettings", async () => {
    const current = await getPreferences();
    const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    const next = { ...current, ...changes };
    next.leadMinutes = [...new Set(next.leadMinutes.map(Number))].sort((a, b) => b - a);
    await setSetting("prefs", JSON.stringify(next));
    return { ...next, calendarToken: await calendarToken() };
  });
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}
