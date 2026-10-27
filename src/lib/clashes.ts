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

/** How much a clash matters, worst first. Low ones are shown folded away and never raise a warning. */
export type Severity = "critical" | "high" | "medium" | "low";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Worth a warning (badge, red calendar day, Discover chip): everything except low. */
export const isNotable = (c: { severity: Severity }) => c.severity !== "low";

type Base = { severity: Severity; reason: string };
export type Clash = Base &
  (
    | { kind: "events"; a: Hackathon; b: Hackathon; days: string[] }
    | { kind: "deadlines"; day: string; items: { deadline: Deadline; hackathon: Hackathon }[] }
    | { kind: "deadline-during-event"; deadline: Deadline; owner: Hackathon; during: Hackathon }
  );

const ACTIVE = (t: TrackedWithHackathon) => t.status !== "results";

const DAY = 86_400_000;
const SHORT_DAYS = 3;
const LONG_DAYS = 7;
const CLOSE_MS = 6 * 3_600_000;

/** You have to be somewhere for it. */
const inPerson = (h: Hackathon) => h.mode !== "online";

/** Length in days; events without a start date count as one day. */
function lengthDays(h: Hackathon): number {
  const r = eventRange(h);
  return r ? Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / DAY)) : 1;
}
const isShort = (h: Hackathon) => lengthDays(h) <= SHORT_DAYS;
const isLongOnline = (h: Hackathon) => !inPerson(h) && lengthDays(h) > LONG_DAYS;

/**
 * Two overlapping events. Being in two places is the worst case; two long online events overlapping is
 * normal (you can work on both), so it's only low.
 */
function eventSeverity(a: Hackathon, b: Hackathon): { severity: Severity; reason: string } {
  if (inPerson(a) && inPerson(b)) return { severity: "critical", reason: "Both are in person, so you can't attend both." };
  if (isLongOnline(a) || isLongOnline(b)) {
    const long = isLongOnline(a) ? a : b;
    return { severity: "low", reason: `${long.title} runs online for ${lengthDays(long)} days, so you can work on both.` };
  }
  const person = inPerson(a) ? a : inPerson(b) ? b : null;
  if (person) {
    const online = person === a ? b : a;
    return isShort(online)
      ? { severity: "high", reason: `You'd be at ${person.title} in person during the short online ${online.title}.` }
      : { severity: "medium", reason: `You'd be at ${person.title} in person for part of ${online.title}.` };
  }
  return isShort(a) && isShort(b)
    ? { severity: "medium", reason: "Two short online hackathons at once: both need your full attention." }
    : { severity: "low", reason: "Both are online, so you can split your time." };
}

/** Clashes among the hackathons you're tracking (finished ones are ignored), worst first. */
export function findClashes(tracked: TrackedWithHackathon[]): Clash[] {
  const live = tracked.filter(ACTIVE);
  const out: Clash[] = [];
  const pairs = new Set<string>();
  const pairKey = (x: string, y: string) => [x, y].sort().join("|");

  // 1. Two hackathons happening on the same day(s)
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i].hackathon;
      const b = live[j].hackathon;
      if (overlaps(a, b)) {
        const bd = new Set(eventDays(b));
        out.push({ kind: "events", a, b, days: eventDays(a).filter((d) => bd.has(d)), ...eventSeverity(a, b) });
        pairs.add(pairKey(a.id, b.id));
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
    if (new Set(items.map((i) => i.hackathon.id)).size < 2) continue;
    const subs = items.filter((i) => i.deadline.kind === "submission");
    const times = subs.map((i) => new Date(i.deadline.dueAt).getTime()).sort((x, y) => x - y);
    const close = times.some((t, k) => k > 0 && t - times[k - 1] <= CLOSE_MS);
    const fromDifferent = new Set(subs.map((i) => i.hackathon.id)).size > 1;
    const sev: Base = fromDifferent && close
      ? { severity: "high", reason: "Two submissions due within 6 hours of each other." }
      : fromDifferent
        ? { severity: "medium", reason: "Two submissions due on the same day." }
        : { severity: "low", reason: "Only registrations or one submission, which take little time." };
    out.push({ kind: "deadlines", day, items, ...sev });
  }

  // 3. A submission due while you're at another hackathon. Registrations take a minute, so they're left out,
  //    and so are long online events (you're never "away" at one) and pairs already reported as overlapping.
  for (const t of live) {
    for (const d of t.deadlines) {
      if (d.done || d.kind !== "submission") continue;
      const due = new Date(d.dueAt);
      for (const other of live) {
        const o = other.hackathon;
        if (other.hackathonId === t.hackathonId || isLongOnline(o) || pairs.has(pairKey(t.hackathonId, o.id))) continue;
        const r = eventRange(o);
        if (!r || !o.startsAt || due < r.start || due > r.end) continue;
        out.push({
          kind: "deadline-during-event", deadline: d, owner: t.hackathon, during: o,
          ...(inPerson(o)
            ? { severity: "high" as const, reason: `You'd be at ${o.title} in person when it's due.` }
            : { severity: "medium" as const, reason: `${o.title} is running online when it's due.` }),
        });
      }
    }
  }

  const when = (c: Clash) => (c.kind === "events" ? c.days[0] ?? "" : c.kind === "deadlines" ? c.day : c.deadline.dueAt);
  return out.sort((x, y) => RANK[x.severity] - RANK[y.severity] || when(x).localeCompare(when(y)));
}

/** Worst severity in a list, or null if there are none. */
export function worstSeverity(clashes: { severity: Severity }[]): Severity | null {
  return clashes.reduce<Severity | null>((w, c) => (w == null || RANK[c.severity] < RANK[w] ? c.severity : w), null);
}

/** For discovery: tracked hackathons a not-yet-tracked one would clash with, at medium or worse. */
export function clashesWithTracked(h: Hackathon, tracked: TrackedWithHackathon[]): Hackathon[] {
  return tracked
    .filter((t) => ACTIVE(t) && t.hackathonId !== h.id && overlaps(h, t.hackathon) && eventSeverity(h, t.hackathon).severity !== "low")
    .map((t) => t.hackathon);
}

/** Calendar days to tint red: only clashes worth a warning. */
export function clashKeyDays(clashes: Clash[]): Set<string> {
  const days = new Set<string>();
  for (const c of clashes) {
    if (!isNotable(c)) continue;
    if (c.kind === "events") c.days.forEach((d) => days.add(d));
    else if (c.kind === "deadlines") days.add(c.day);
    else days.add(dayKey(c.deadline.dueAt));
  }
  return days;
}
