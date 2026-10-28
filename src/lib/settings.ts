import "server-only";
import { calendarToken, getSetting, setSetting } from "./db";
import type { Settings } from "./types";

const DEFAULTS: Omit<Settings, "calendarToken"> = {
  email: "",
  remindersEnabled: true,
  leadMinutes: [24 * 60, 3 * 60],
  calendarProvider: "google",
};

export function getSettings(): Settings {
  const raw = getSetting("prefs");
  const prefs = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  return { ...prefs, calendarToken: calendarToken() };
}

export function saveSettings(patch: Partial<Omit<Settings, "calendarToken">>): Settings {
  const { calendarToken: _ignored, ...current } = getSettings();
  void _ignored;
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) };
  if (next.leadMinutes) next.leadMinutes = [...new Set(next.leadMinutes.map(Number))].sort((a, b) => b - a);
  setSetting("prefs", JSON.stringify(next));
  return getSettings();
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}
