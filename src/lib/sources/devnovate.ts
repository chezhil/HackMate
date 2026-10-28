import type { Hackathon, Mode } from "../types";
import { inferThemes } from "../themes";
import { listing, stillRelevant } from "./shared";
import { fetchJson, parsePrizeUsd, toUsd } from "./util";

// Devnovate (devnovate.co) lists its events through a public JSON endpoint its own site reads. Each record also
// carries the organiser's personal contact details and team leads; only the public event fields below are read,
// and nothing else is kept.

interface DevnovateEvent {
  _id: string;
  name: string;
  /** The slug in its link: devnovate.co/event/<hackathon>. */
  hackathon: string;
  eventType?: string;
  approvalStatus?: string;
  status?: string; // OFFLINE | ONLINE | HYBRID
  startDate?: string; // "02-11-2026" or "2026-11-02"
  endDate?: string;
  registrationDeadline?: string; // "2026-11-01" or "2026-11-07T11:39"
  location?: string;
  prizePool?: string;
  prizes?: { place?: string; amount?: string; extras?: string }[];
  teamSize?: string;
  paid?: boolean;
  price?: number;
  organizationName?: string;
  cardImage?: string;
  subtitle?: string;
  about?: string;
  theme?: string[];
  rules?: string[];
  faq?: { question?: string; answer?: string }[];
  judgingCriteria?: unknown[];
  evaluationCriteria?: unknown[];
}

const IST = "+05:30";

/** Devnovate writes dates as DD-MM-YYYY or YYYY-MM-DD (sometimes with a time), in India time. */
export function devnovateDate(value: string | undefined, endOfDay = false): string | null {
  const v = value?.trim();
  if (!v) return null;
  const dmy = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  const [y, m, d, time] = dmy ? [dmy[3], dmy[2], dmy[1], undefined] : ymd ? [ymd[1], ymd[2], ymd[3], ymd[4]] : [];
  if (!y) return null;
  const t = new Date(`${y}-${m}-${d}T${time ?? (endOfDay ? "23:59" : "00:00")}:00${IST}`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** "2-5", "1 - 4", "individual", "Up to 5 members per team" → min and max. */
export function devnovateTeam(text: string | undefined): { min: number | null; max: number | null } {
  const t = (text ?? "").toLowerCase();
  if (/individual|solo/.test(t)) return { min: 1, max: 1 };
  const range = t.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const upTo = t.match(/up to\s*(\d+)/) ?? t.match(/max(?:imum)?\s*(\d+)/);
  return upTo ? { min: null, max: Number(upTo[1]) } : { min: null, max: null };
}

const MODE: Record<string, Mode> = { OFFLINE: "offline", ONLINE: "online", HYBRID: "hybrid" };

const asText = (v: unknown): string =>
  typeof v === "string" ? v : Array.isArray(v) ? v.map(asText).filter(Boolean).join("; ") : v && typeof v === "object" ? Object.values(v).map(asText).filter(Boolean).join(" — ") : "";

export function normalizeDevnovate(e: DevnovateEvent): Hackathon {
  const mode = MODE[e.status ?? ""] ?? "online";
  const team = devnovateTeam(e.teamSize);
  const cash = (e.prizes ?? []).reduce((sum, p) => sum + (Number(String(p.amount ?? "").replace(/[^\d.]/g, "")) || 0), 0);
  const pool = e.prizePool?.trim() || null;
  const prizeText = cash > 0 ? `₹${cash.toLocaleString("en-IN")} in prizes` : pool && pool.length <= 80 ? pool : null;
  const blurb = (e.subtitle ?? e.about ?? "").replace(/^\s*about the event\s*/i, "").trim();
  const raw = e.location?.trim() || null;
  // "Online", "Hybrid", "TBA" aren't places.
  const location = raw && !/^(online|offline|hybrid|tba|tbd|to be announced|virtual)$/i.test(raw) ? raw : null;
  // "Venue, Faridabad": the last part is the city. A short name on its own ("Panipat") is the city itself;
  // a longer unpunctuated one ("VVCE Campus") stays the venue.
  const parts = location?.split(",").map((p) => p.trim()).filter(Boolean) ?? [];
  const city = parts.length > 1 ? parts[parts.length - 1] : location && location.split(/\s+/).length <= 2 && !/campus|university|college|institute|school|hall|centre|center/i.test(location) ? location : null;
  return {
    ...listing("devnovate", e._id, e.name, `https://devnovate.co/event/${encodeURIComponent(e.hackathon)}`),
    tagline: blurb ? blurb.split(/\n+/)[0].slice(0, 200) : null,
    image: e.cardImage || null,
    mode,
    city: mode === "online" ? null : city,
    venue: mode === "online" ? null : location,
    startsAt: devnovateDate(e.startDate),
    endsAt: devnovateDate(e.endDate, true),
    regEndsAt: devnovateDate(e.registrationDeadline, true),
    prizeText,
    prizeUsd: cash > 0 ? toUsd(cash, "INR") : parsePrizeUsd(pool),
    entryFee: e.paid && (e.price ?? 0) > 0 ? "paid" : "free",
    themes: inferThemes(e.name, `${(e.theme ?? []).join(" ")} ${blurb.slice(0, 400)}`),
    organizer: e.organizationName?.trim() || null,
    teamMin: team.min,
    teamMax: team.max,
    // The rules the AI reads for Overview and Ask AI: the event's own text, never its contact details.
    description: [
      blurb,
      e.rules?.length && `Rules:\n${e.rules.map((r) => `- ${asText(r)}`).join("\n")}`,
      e.prizes?.length && `Prizes:\n${e.prizes.map((p) => `- ${[p.place, p.amount && `₹${p.amount}`, p.extras].filter(Boolean).join(": ")}`).join("\n")}`,
      pool && `Prize pool: ${pool}`,
      e.teamSize && `Team size: ${e.teamSize}`,
      (e.judgingCriteria?.length || e.evaluationCriteria?.length) && `Judging: ${asText(e.judgingCriteria?.length ? e.judgingCriteria : e.evaluationCriteria)}`,
      e.faq?.length && `FAQ:\n${e.faq.map((f) => `Q: ${f.question ?? ""}\nA: ${f.answer ?? ""}`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20_000) || null,
  };
}

/** Approved hackathons that haven't ended. */
export async function fetchDevnovate(): Promise<Hackathon[]> {
  const events = await fetchJson<DevnovateEvent[]>("https://devnovate.co/api/v1/events");
  if (!Array.isArray(events)) throw new Error("Devnovate: unrecognized events response");
  return events
    .filter((e) => e._id && e.name && e.hackathon && e.approvalStatus === "approved" && (e.eventType ?? "hackathon") === "hackathon")
    .map(normalizeDevnovate)
    .filter((h) => stillRelevant(h));
}

/** One event by the slug in its link (devnovate.co/event/<slug>), open or over. */
export async function fetchDevnovateEvent(slug: string): Promise<Hackathon | null> {
  const events = await fetchJson<DevnovateEvent[]>("https://devnovate.co/api/v1/events");
  const e = Array.isArray(events) ? events.find((x) => x.hackathon?.toLowerCase() === slug.toLowerCase() && x._id && x.name) : undefined;
  return e ? normalizeDevnovate(e) : null;
}
