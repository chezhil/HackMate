import type { Hackathon } from "../types";
import { inferThemes } from "../themes";
import { absoluteUrl, listing, stillRelevant } from "./shared";
import { fetchJson, parsePrizeUsd, stripHtml } from "./util";

interface DevpostEvent {
  id: number; title: string; url: string; open_state?: string;
  displayed_location?: { icon?: string; location?: string };
  thumbnail_url?: string; submission_period_dates?: string;
  themes?: { name: string }[]; prize_amount?: string; organization_name?: string;
}
interface DevpostPage { hackathons: DevpostEvent[]; meta: { total_count: number; per_page: number } }

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY = 86400_000;

/** Listing dates omit the start year/month when shared. Parse explicitly, avoiding Date's 2001 fallback. */
export function devpostDates(value: string): { startsAt: string | null; endsAt: string | null } {
  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s*[-–—]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}),?\s+(\d{4})$/);
  const single = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const date = (month: string, day: string, year: number) => {
    const m = MONTHS.indexOf(month.slice(0, 3).toLowerCase());
    const d = new Date(Date.UTC(year, m, Number(day)));
    return m >= 0 && d.getUTCMonth() === m && d.getUTCDate() === Number(day) ? d : null;
  };
  if (single) {
    const start = date(single[1], single[2], Number(single[3]));
    return { startsAt: start?.toISOString() ?? null, endsAt: start ? new Date(start.getTime() + DAY - 1).toISOString() : null };
  }
  if (!match) return { startsAt: null, endsAt: null };
  const [, aMonth, aDay, aYear, bMonth, bDay, bYear] = match;
  const end = date(bMonth ?? aMonth, bDay, Number(bYear));
  const rollsOver = MONTHS.indexOf(aMonth.slice(0, 3).toLowerCase()) > MONTHS.indexOf((bMonth ?? aMonth).slice(0, 3).toLowerCase());
  const start = date(aMonth, aDay, aYear ? Number(aYear) : Number(bYear) - (rollsOver ? 1 : 0));
  if (!start || !end || start > end) return { startsAt: null, endsAt: null };
  return { startsAt: start.toISOString(), endsAt: new Date(end.getTime() + DAY - 1).toISOString() };
}

export function normalizeDevpost(e: DevpostEvent): Hackathon {
  const h = listing("devpost", String(e.id), e.title, absoluteUrl(e.url, "https://devpost.com")!);
  const location = e.displayed_location?.location?.trim() ?? "";
  const online = e.displayed_location?.icon === "globe" || /\bonline\b|\bvirtual\b/i.test(location);
  const prize = stripHtml(e.prize_amount, 300);
  const firstPart = location.split(",")[0]?.trim() || null;
  // The location label is often a venue ("SEI Building"), not a city.
  const city = firstPart && !/\d|university|college|campus|building|conference|room|student cent(?:er|re)|hub|auditorium|institute/i.test(firstPart) ? firstPart : null;
  return { ...h, ...devpostDates(e.submission_period_dates ?? ""),
    image: absoluteUrl(e.thumbnail_url, "https://devpost.com"),
    mode: online ? "online" : "offline", venue: online ? null : location || null,
    city: online ? null : city,
    prizeText: prize, prizeUsd: parsePrizeUsd(prize),
    themes: inferThemes(e.title, e.themes?.map((t) => t.name).join(" ")),
    organizer: e.organization_name ?? null,
  };
}

export async function fetchDevpost(): Promise<Hackathon[]> {
  const events = new Map<string, Hackathon>();
  for (let page = 1; page <= 25; page++) {
    const data = await fetchJson<DevpostPage>(`https://devpost.com/api/hackathons?status%5B%5D=open&status%5B%5D=upcoming&per_page=100&page=${page}`);
    if (!Array.isArray(data.hackathons) || !Number.isFinite(data.meta?.total_count) || !(data.meta.per_page > 0)) throw new Error("Devpost: unrecognized listing response");
    for (const e of data.hackathons) {
      if (!e.title || !e.id || !absoluteUrl(e.url, "https://devpost.com") || (e.open_state && !["open", "upcoming"].includes(e.open_state))) continue;
      const h = normalizeDevpost(e);
      if (stillRelevant(h)) events.set(h.id, h);
    }
    if (page * data.meta.per_page >= data.meta.total_count || data.hackathons.length === 0) return [...events.values()];
  }
  throw new Error("Devpost: listing exceeded the pagination limit");
}
