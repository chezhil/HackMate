import type { Hackathon } from "../types";
import { inferThemes } from "../themes";
import { fetchJson, iso } from "./util";

interface DevfolioSource {
  uuid: string;
  name: string;
  tagline: string | null;
  slug: string;
  cover_img: string | null;
  is_online: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  location: string | null;
  desc?: string | null;
  team_min?: number | null;
  team_size?: number | null;
  prizes?: { name: string; desc: string | null }[];
  starts_at: string | null;
  ends_at: string | null;
  themes?: { name: string }[];
  hosted_by?: { name?: string } | null;
  hackathon_setting?: {
    reg_starts_at: string | null;
    reg_ends_at: string | null;
    logo: string | null;
    site: string | null;
  } | null;
}

interface DevfolioResponse {
  hits: { hits: { _source: DevfolioSource }[] };
}

// "application_open" = taking applications now, "upcoming" = announced but not open yet.
const QUERY_TYPES = ["application_open", "upcoming"];

export async function fetchDevfolio(): Promise<Hackathon[]> {
  const byId = new Map<string, Hackathon>();
  for (const type of QUERY_TYPES) {
    const res = await fetchJson<DevfolioResponse>("https://api.devfolio.co/api/search/hackathons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, from: 0, size: 100 }),
    });
    for (const hit of res.hits.hits) {
      const h = normalize(hit._source);
      byId.set(h.id, h);
    }
  }
  return [...byId.values()];
}

function normalize(s: DevfolioSource): Hackathon {
  const themeNames = (s.themes ?? []).map((t) => t.name);
  return {
    id: `devfolio:${s.uuid}`,
    source: "devfolio",
    title: s.name.trim(),
    tagline: s.tagline,
    url: `https://${s.slug}.devfolio.co/`,
    image: s.hackathon_setting?.logo || s.cover_img || null,
    mode: s.is_online ? "online" : "offline",
    city: s.is_online ? null : s.city,
    state: s.is_online ? null : s.state,
    country: s.is_online ? null : s.country,
    venue: s.is_online ? null : s.location,
    lat: null,
    lng: null,
    startsAt: iso(s.starts_at),
    endsAt: iso(s.ends_at),
    regStartsAt: iso(s.hackathon_setting?.reg_starts_at),
    regEndsAt: iso(s.hackathon_setting?.reg_ends_at),
    prizeText: null,
    prizeUsd: null,
    entryFee: "free",
    themes: inferThemes(s.name, s.tagline, themeNames.join(" ")),
    organizer: s.hosted_by?.name ?? null,
    teamMin: s.team_min ?? null,
    teamMax: s.team_size ?? null,
    description: [
      s.desc,
      s.prizes?.length ? `## Prizes\n${s.prizes.map((p) => `- ${p.name}${p.desc ? `: ${p.desc}` : ""}`).join("\n")}` : null,
    ]
      .filter(Boolean)
      .join("\n\n") || null,
  };
}
