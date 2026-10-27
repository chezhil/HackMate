/** Status colours as one vocabulary, so a score, a check and a prize never pick their own greens. */
export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger";

/** Filled badge: soft background, strong text. */
export const SOFT: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

/** Row or banner: soft background with a matching border. */
export const OUTLINE: Record<Tone, string> = {
  neutral: "border-border bg-surface-2 text-text",
  accent: "border-accent/40 bg-accent-soft text-accent",
  ok: "border-ok/40 bg-ok-soft text-ok",
  warn: "border-warn/40 bg-warn-soft text-warn",
  danger: "border-danger/40 bg-danger-soft text-danger",
};

/** AI scores out of 10: 8+ good, 5+ needs work, below 5 weak. */
export function scoreTone(score: number): Tone {
  return score >= 8 ? "ok" : score >= 5 ? "warn" : "danger";
}

/** Eight categorical colours for calendar bars and map pins, all AA with white text. */
export const EVENT_COLORS = Array.from({ length: 8 }, (_, i) => `var(--event-${i + 1})`);

/** Resolve a token to its current value, for libraries (Leaflet) that can't take var(). */
export function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}
