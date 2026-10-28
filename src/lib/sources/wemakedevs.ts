import type { Hackathon, Mode } from "../types";
import { inferThemes } from "../themes";
import { fetchText, iso, parsePrizeUsd } from "./util";
import { jsonObjects, rscText } from "./shared";

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
  return parseWeMakeDevs(await fetchText(`${BASE}/hackathons`));
}

export function parseWeMakeDevs(html: string): Hackathon[] {
  const data = rscText(html) || html.replace(/\\"/g, '"');
  const cards = new Map<string, WmdCard>();
  for (const obj of jsonObjects(data, '{"id":"')) {
    if (typeof obj.title === "string" && "startDate" in obj && "formats" in obj) {
      // RSC escapes strings that start with "$" as "$$"
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" && v.startsWith("$$")) obj[k] = v.slice(1);
      }
      cards.set(obj.id as string, obj as unknown as WmdCard);
    }
  }
  if (!cards.size) throw new Error("WeMakeDevs: could not find embedded hackathon data");
  return [...cards.values()].map(normalize);
}

function normalize(c: WmdCard): Hackathon {
  const prizeUsd = parsePrizeUsd(c.prize);
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
    prizeText: prizeUsd ? c.prize : null,
    prizeUsd,
    entryFee: "free",
    themes: inferThemes(c.title, c.prize),
    organizer: "WeMakeDevs",
    teamMin: null,
    teamMax: null,
  };
}
