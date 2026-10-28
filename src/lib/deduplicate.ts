import type { Hackathon } from "./types";

const DAY = 86400_000;
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/bangalore/g, "bengaluru").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const years = (title: string): string[] => title.match(/\b20\d{2}\b/g) ?? [];
const nameKey = (title: string) => normalize(title).replace(/\b20\d{2}\b|\bhackathons?\b/g, " ").trim().replace(/\s+/g, " ");
const GENERIC = new Set(["ai", "ml", "global", "online", "virtual", "coding", "code", "innovation", "challenge", "the", "and"]);
const specific = (title: string) => nameKey(title).split(" ").some((word) => word.length >= 4 && !GENERIC.has(word));

function eventUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "").toLowerCase();
    // A platform home page is not an event identity.
    if ((!path || ["/hackathons", "/events", "/challenges"].includes(path)) && ["devpost.com", "devfolio.co", "unstop.com", "hack2skill.com", "devsemble.com", "lablab.ai", "hackerearth.com", "mlh.com", "wemakedevs.org"].includes(host)) return null;
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid|ref)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return `${host}${path}${url.search}`;
  } catch { return null; }
}

function compatibleLocation(a: Hackathon, b: Hackathon): boolean {
  if (a.mode === "online" || b.mode === "online") return true;
  if (a.country && b.country && normalize(a.country) !== normalize(b.country)) return false;
  if (a.city && b.city && normalize(a.city) !== normalize(b.city)) {
    // A feed may use a suburb as its city while its address names the same parent city.
    const av = normalize(a.venue ?? ""), bv = normalize(b.venue ?? "");
    const contains = (address: string, city: string) => ` ${address} `.includes(` ${normalize(city)} `);
    return contains(av, b.city) || contains(bv, a.city);
  }
  return true;
}

function near(a: string | null, b: string | null): boolean {
  return Boolean(a && b && Math.abs(Date.parse(a) - Date.parse(b)) <= 36 * 3600_000);
}

/** Conservative cross-platform identity: title + matching dates, or the same event URL. */
export function sameHackathon(a: Hackathon, b: Hackathon): boolean {
  if (a.id === b.id) return true;
  const ay = years(a.title), by = years(b.title);
  if (ay.length && by.length && !ay.some((year) => by.includes(year))) return false;
  if (!compatibleLocation(a, b)) return false;
  const au = eventUrl(a.url), bu = eventUrl(b.url);
  if (au && au === bu) {
    // An organizer may reuse the same event site in subsequent years.
    const ae = a.endsAt ?? a.startsAt, be = b.endsAt ?? b.startsAt;
    return !(ae && be && Math.abs(Date.parse(ae) - Date.parse(be)) > 90 * DAY);
  }
  if (!specific(a.title) || nameKey(a.title) !== nameKey(b.title)) return false;
  if (a.endsAt && b.endsAt) return near(a.endsAt, b.endsAt);
  if (a.startsAt && b.startsAt) return near(a.startsAt, b.startsAt);
  return near(a.regEndsAt, b.regEndsAt);
}

function richness(h: Hackathon): number {
  return [h.startsAt, h.endsAt, h.regEndsAt, h.city, h.venue, h.image, h.prizeUsd, h.teamMax, h.tagline].filter((v) => v != null).length;
}

/** Read-time grouping preserves source rows, saved deadlines, notes, and stable pinned identities. */
export function deduplicateHackathons(list: Hackathon[], trackedIds = new Set<string>()): Hackathon[] {
  const groups: Hackathon[][] = [];
  const index = new Map<string, Set<Hackathon[]>>();
  for (const h of list) {
    const keys = [`id:${h.id}`, `name:${nameKey(h.title)}`];
    const url = eventUrl(h.url);
    if (url) keys.push(`url:${url}`);
    const candidates = new Set(keys.flatMap((key) => [...(index.get(key) ?? [])]));
    // Require agreement with every member so a sparse record cannot bridge different editions.
    let group = [...candidates].find((items) => items.every((other) => sameHackathon(h, other)));
    if (group) group.push(h);
    else { group = [h]; groups.push(group); }
    for (const key of keys) {
      if (!index.has(key)) index.set(key, new Set());
      index.get(key)!.add(group);
    }
  }
  return groups.map((group) => {
    const sorted = [...group].sort((a, b) => Number(trackedIds.has(b.id)) - Number(trackedIds.has(a.id)) || richness(b) - richness(a) || a.id.localeCompare(b.id));
    const [primary] = sorted;
    if (sorted.length === 1) return primary;
    const merged = { ...primary };
    for (const h of sorted.slice(1)) {
      for (const key of ["tagline", "image", "startsAt", "endsAt", "regStartsAt", "regEndsAt", "city", "state", "country", "venue", "lat", "lng", "prizeText", "prizeUsd", "entryFee", "organizer", "teamMin", "teamMax", "aiPolicy"] as const) {
        if (merged[key] == null && h[key] != null) Object.assign(merged, { [key]: h[key] });
      }
    }
    merged.themes = [...new Set(sorted.flatMap((h) => h.themes))];
    merged.sourceListings = sorted.map((h) => ({ id: h.id, source: h.source, url: h.url }));
    return merged;
  });
}
