"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./themeScript";

export type ThemePref = "system" | "light" | "dark";

const CHANGE = "hackmate-theme-change";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Saves the choice and applies it to <html data-theme>; "system" removes the attribute so the OS decides. */
export function setTheme(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage blocked (private window): the choice still applies until the page closes.
  }
  if (pref === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb);
  // The first client render uses the server value ("system"); re-read once mounted so a saved choice shows.
  queueMicrotask(cb);
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The saved preference; "system" while rendering on the server so the HTML matches. */
export function useTheme(): ThemePref {
  return useSyncExternalStore(subscribe, read, () => "system");
}
