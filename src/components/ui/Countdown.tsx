"use client";

import { Clock } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SOFT, type Tone } from "./tone";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const subscribe = (tick: () => void) => {
  const t = setInterval(tick, 1000);
  return () => clearInterval(t);
};
const snapshot = () => Math.floor(Date.now() / 1000) * 1000;

/** Current time to the second, or null while rendering on the server, so server and client HTML agree. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

function parts(ms: number) {
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** Time left to a deadline. Neutral beyond 3 days, warn within 3, danger and counting seconds inside 24 h. */
export function Countdown({ to, label }: { to: string; label?: string }) {
  const now = useNow();
  const target = new Date(to).getTime();
  const left = now == null ? null : target - now;

  const tone: Tone = left == null ? "neutral" : left < DAY ? "danger" : left < 3 * DAY ? "warn" : "neutral";
  const text = left == null ? "…" : left <= 0 ? "Overdue" : parts(left);
  return (
    <time
      dateTime={to}
      title={now == null ? undefined : new Date(target).toLocaleString()}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${SOFT[tone]}`}
    >
      <Clock aria-hidden className="size-3" />
      {label && <span className="font-normal">{label}</span>}
      {text}
    </time>
  );
}
