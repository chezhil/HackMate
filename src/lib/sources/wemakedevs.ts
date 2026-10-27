import type { Hackathon, Mode } from "../types";
import { inferThemes } from "../themes";
import { fetchText, iso, parsePrizeUsd } from "./util";

interface WmdCard {
  id: string;
  title: string;
  location: string | null;
  formats: string[];
  prize: string | null;
  image: string | null;
  href: string;
  isExternal: boolean;
  startDate: string | null;
  endDate: string | null;
}

const BASE = "https://www.wemakedevs.org";

export async function fetchWeMakeDevs(): Promise<Hackathon[]> {
  // The hackathon list is rendered from React Server Component data embedded in the page.
  const html = (await fetchText(`${BASE}/hackathons`)).replace(/\\"/g, '"');
  const cards = new Map<string, WmdCard>();
  for (const obj of extractObjects(html, '{"id":"')) {
    if (typeof obj.title === "string" && "startDate" in obj && "formats" in obj) {
      // RSC escapes strings that start with "$" as "$$"
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" && v.startsWith("$$")) obj[k] = v.slice(1);
      }
      cards.set(obj.id as string, obj as unknown as WmdCard);
    }
  }
  return [...cards.values()].map(normalize);
}

/** Find every balanced JSON object starting with `prefix` and parse the ones that are valid. */
function extractObjects(text: string, prefix: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(prefix, from);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) break;
    try {
      out.push(JSON.parse(text.slice(start, end + 1)));
    } catch {
      // not a card object; skip
    }
    from = start + prefix.length;
  }
  return out;
}

function normalize(c: WmdCard): Hackathon {
  const online = c.formats.includes("online");
  const offline = c.formats.includes("offline");
  const mode: Mode = online && offline ? "hybrid" : offline ? "offline" : "online";
  const place = c.location && !/^(remote|hybrid|online)$/i.test(c.location) ? c.location : null;
  const [city, state] = place ? place.split(",").map((s) => s.trim()) : [null, null];
  return {
    id: `wemakedevs:${c.id}`,
    source: "wemakedevs",
    title: c.title.trim(),
    tagline: c.prize,
    url: c.isExternal ? c.href : `${BASE}${c.href}`,
    image: c.image,
    mode,
    city: city ?? null,
    state: state ?? null,
    country: null, // not given; the geocoder works it out from city + state
    venue: null,
    lat: null,
    lng: null,
    startsAt: iso(c.startDate),
    endsAt: iso(c.endDate),
    regStartsAt: null,
    regEndsAt: null,
    // the "prize" field is a free-form blurb; only treat it as a prize when it names an amount
    prizeText: parsePrizeUsd(c.prize) ? c.prize : null,
    prizeUsd: parsePrizeUsd(c.prize),
    entryFee: "free",
    themes: inferThemes(c.title, c.prize),
    organizer: "WeMakeDevs",
    teamMin: null,
    teamMax: null,
  };
}
