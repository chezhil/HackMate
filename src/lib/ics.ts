// iCalendar (RFC 5545) output for the calendar subscription feed and single-event downloads.
import type { Deadline, Hackathon, TrackedWithHackathon } from "./types";
import { STATUSES } from "./types";

function stamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escape(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const utf8 = new TextEncoder();

/** Lines longer than 75 octets must be folded (without splitting a multi-byte character). */
function fold(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = utf8.encode(ch).length;
    if (bytes + size > 74) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

function where(h: Hackathon) {
  if (h.mode === "online") return "Online";
  return [h.venue, h.city, h.state, h.country].filter(Boolean).join(", ") || h.mode;
}

export function hackathonEvent(h: Hackathon, status?: string): string[] {
  if (!h.startsAt && !h.endsAt) return [];
  const start = h.startsAt ?? new Date(new Date(h.endsAt!).getTime() - 3600_000).toISOString();
  const end = h.endsAt && new Date(h.endsAt) > new Date(start)
    ? h.endsAt : new Date(new Date(start).getTime() + 3600_000).toISOString();
  return [
    "BEGIN:VEVENT",
    `UID:${h.id.replace(":", "-")}@hackmate`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`🏁 ${h.title}`)}`,
    `LOCATION:${escape(where(h))}`,
    `DESCRIPTION:${escape([status && `Status: ${status}`, h.tagline, h.url].filter(Boolean).join("\n"))}`,
    ...(h.url ? [`URL:${h.url}`] : []),
    "END:VEVENT",
  ];
}

export function deadlineEvent(d: Deadline, h: Hackathon, alarmMinutes: number[]): string[] {
  const start = new Date(d.dueAt);
  const begin = new Date(start.getTime() - 30 * 60_000); // show as a 30 min block ending at the deadline
  return [
    "BEGIN:VEVENT",
    `UID:deadline-${d.id}@hackmate`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(begin.toISOString())}`,
    `DTEND:${stamp(start.toISOString())}`,
    `SUMMARY:${escape(`⏰ ${d.label} — ${h.title}`)}`,
    `DESCRIPTION:${escape([`${d.label} for ${h.title}`, h.url].filter(Boolean).join("\n"))}`,
    ...(h.url ? [`URL:${h.url}`] : []),
    ...alarmMinutes.flatMap((m) => [
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(`${d.label} — ${h.title}`)}`,
      `TRIGGER;RELATED=END:-PT${m}M`,
      "END:VALARM",
    ]),
    "END:VEVENT",
  ];
}

export function buildCalendar(name: string, events: string[][]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HackMate//Hackathon Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function trackerCalendar(tracked: TrackedWithHackathon[], alarmMinutes: number[]): string {
  const label = (s: string) => STATUSES.find((x) => x.key === s)?.label ?? s;
  const events = tracked.flatMap((t) => [
    hackathonEvent(t.hackathon, label(t.status)),
    ...t.deadlines.filter((d) => !d.done && d.kind !== "start").map((d) => deadlineEvent(d, t.hackathon, alarmMinutes)),
  ]);
  return buildCalendar("HackMate", events);
}
