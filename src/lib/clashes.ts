// Pure date helpers + clash detection. Runs in the browser so "same day" uses the viewer's time zone.
import type { Deadline, Hackathon, TrackedWithHackathon } from "./types";

export function dayKey(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** The event's span. Sources without a start date (Unstop) are treated as a one-day event on the end date. */
export function eventRange(h: Hackathon): { start: Date; end: Date } | null {
  const end = h.endsAt ?? h.startsAt;
  if (!end) return null;
  return { start: new Date(h.startsAt ?? end), end: new Date(end) };
}

/** Every local calendar day an event touches. */
export function eventDays(h: Hackathon): string[] {
  const r = eventRange(h);
  if (!r) return [];
  const days: string[] = [];
  const cur = new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate());
  const last = new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate());
  for (let i = 0; cur <= last && i < 62; i++) {
    days.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function overlaps(a: Hackathon, b: Hackathon) {
  const ra = eventRange(a);
  const rb = eventRange(b);
  if (!ra || !rb) return false;
  if (ra.start <= rb.end && rb.start <= ra.end) return true;
  // same calendar day counts as a clash even if the hours don't strictly overlap
  const bDays = new Set(eventDays(b));
  return eventDays(a).some((d) => bDays.has(d));
}

export type Clash =
  | { kind: "events"; a: Hackathon; b: Hackathon; days: string[] }
  | { kind: "deadlines"; day: string; items: { deadline: Deadline; hackathon: Hackathon }[] }
  | { kind: "deadline-during-event"; deadline: Deadline; owner: Hackathon; during: Hackathon };

const ACTIVE = (t: TrackedWithHackathon) => t.status !== "results";

/** Clashes among the hackathons you're tracking (finished ones are ignored). */
export function findClashes(tracked: TrackedWithHackathon[]): Clash[] {
  const live = tracked.filter(ACTIVE);
  const out: Clash[] = [];

  // 1. Two hackathons happening on the same day(s)
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i].hackathon;
      const b = live[j].hackathon;
      if (overlaps(a, b)) {
        const bd = new Set(eventDays(b));
        out.push({ kind: "events", a, b, days: eventDays(a).filter((d) => bd.has(d)) });
      }
    }
  }

  // 2. Deadlines from different hackathons on the same day
  const byDay = new Map<string, { deadline: Deadline; hackathon: Hackathon }[]>();
  for (const t of live) {
    for (const d of t.deadlines) {
      if (d.done || d.kind === "start") continue;
      const k = dayKey(d.dueAt);
      byDay.set(k, [...(byDay.get(k) ?? []), { deadline: d, hackathon: t.hackathon }]);
    }
  }
  for (const [day, items] of byDay) {
    if (new Set(items.map((i) => i.hackathon.id)).size > 1) out.push({ kind: "deadlines", day, items });
  }

  // 3. A submission/registration deadline that lands while you're at another hackathon
  for (const t of live) {
    for (const d of t.deadlines) {
      if (d.done || d.kind === "start") continue;
      const due = new Date(d.dueAt);
      for (const other of live) {
        if (other.hackathonId === t.hackathonId) continue;
        const r = eventRange(other.hackathon);
        if (r && other.hackathon.startsAt && due >= r.start && due <= r.end) {
          out.push({ kind: "deadline-during-event", deadline: d, owner: t.hackathon, during: other.hackathon });
        }
      }
    }
  }
  return out;
}

/** For discovery: which tracked hackathons a not-yet-tracked one would clash with. */
export function clashesWithTracked(h: Hackathon, tracked: TrackedWithHackathon[]): Hackathon[] {
  return tracked.filter((t) => ACTIVE(t) && t.hackathonId !== h.id && overlaps(h, t.hackathon)).map((t) => t.hackathon);
}

export function clashKeyDays(clashes: Clash[]): Set<string> {
  const days = new Set<string>();
  for (const c of clashes) {
    if (c.kind === "events") c.days.forEach((d) => days.add(d));
    else if (c.kind === "deadlines") days.add(c.day);
    else days.add(dayKey(c.deadline.dueAt));
  }
  return days;
}
