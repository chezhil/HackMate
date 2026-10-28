import type { Hackathon } from "../types";
import { inferThemes } from "../themes";
import { absoluteUrl, listing, stillRelevant, utcIso } from "./shared";
import { fetchJson } from "./util";

interface HackerEarthEvent {
  slug: string; title: string; type: string; url: string; start?: string; end?: string;
  company_name?: string; image_url?: string; listing_image?: string;
  min_team_size?: number; max_team_size?: number;
}

export function normalizeHackerEarth(e: HackerEarthEvent): Hackathon {
  const h = listing("hackerearth", e.slug, e.title, absoluteUrl(e.url, "https://www.hackerearth.com")!);
  return { ...h, startsAt: utcIso(e.start), endsAt: utcIso(e.end),
    image: absoluteUrl(e.listing_image || e.image_url, "https://www.hackerearth.com"),
    themes: inferThemes(e.title), organizer: e.company_name ?? null,
    teamMin: e.min_team_size ?? null, teamMax: e.max_team_size ?? null,
  };
}

export async function fetchHackerEarth(): Promise<Hackathon[]> {
  const response = await fetchJson<{ data: HackerEarthEvent[] }>("https://www.hackerearth.com/api/community/challenges/compete/");
  if (!Array.isArray(response.data)) throw new Error("HackerEarth: unrecognized listing response");
  return [...new Map(response.data.filter((e) => e.type?.toLowerCase() === "hackathon" && e.slug && e.title && absoluteUrl(e.url, "https://www.hackerearth.com"))
    .map(normalizeHackerEarth).filter((h) => stillRelevant(h)).map((h) => [h.id, h])).values()];
}
