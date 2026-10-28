import type { Hackathon } from "./types";

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dateYearFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (d.getFullYear() === new Date().getFullYear() ? dateFmt : dateYearFmt).format(d);
}

export function fmtDateTime(iso: string) {
  return dateTimeFmt.format(new Date(iso));
}

export function fmtRange(h: Pick<Hackathon, "startsAt" | "endsAt">) {
  if (h.startsAt && h.endsAt) {
    const a = fmtDate(h.startsAt);
    const b = fmtDate(h.endsAt);
    return a === b ? a : `${a} – ${b}`;
  }
  if (h.endsAt) return `ends ${fmtDate(h.endsAt)}`;
  return fmtDate(h.startsAt);
}

/** "in 3 days", "in 5 hours", "2 days ago" */
export function relative(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 48 * 3600_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

export function urgency(iso: string, now = Date.now()): "past" | "soon" | "near" | "later" {
  const diff = new Date(iso).getTime() - now;
  if (diff < 0) return "past";
  if (diff < 48 * 3600_000) return "soon";
  if (diff < 7 * 86_400_000) return "near";
  return "later";
}

export function place(h: Hackathon) {
  if (h.mode === "online") return "Online";
  return [h.city, h.country].filter(Boolean).join(", ") || (h.mode === "hybrid" ? "Hybrid" : "In person");
}

export function fmtUsd(n: number) {
  return n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${n}`;
}

/** Value for <input type="datetime-local"> in the viewer's time zone. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
