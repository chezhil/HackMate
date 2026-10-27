"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { setTheme, useTheme, type ThemePref } from "@/lib/theme";

const NEXT: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
const ICON = { system: Monitor, light: Sun, dark: Moon };
const NAME = { system: "System", light: "Light", dark: "Dark" };

/** One button that cycles System → Light → Dark. The label says what it is now and what a click does. */
export function ThemeSwitch() {
  const pref = useTheme();
  const Icon = ICON[pref];
  const label = `Theme: ${NAME[pref]}. Switch to ${NAME[NEXT[pref]]}`;
  return (
    <button type="button" className="btn btn-sm" onClick={() => setTheme(NEXT[pref])} aria-label={label} title={label}>
      <Icon aria-hidden className="size-4" />
      <span className="hidden sm:inline">{NAME[pref]}</span>
    </button>
  );
}
