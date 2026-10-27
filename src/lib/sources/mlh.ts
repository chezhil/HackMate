import type { Hackathon, Mode } from "../types";
import { inferThemes } from "../themes";
import { fetchText, iso } from "./util";

interface MlhEvent {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  endsAt: string;
  url: string;
  location: string | null;
  formatType: "physical" | "digital" | "hybrid" | string;
  logoUrl: string | null;
  backgroundUrl: string | null;
  websiteUrl: string | null;
  customFields?: { hackathon_focus?: string[] };
  venueAddress?: { city: string | null; state: string | null; country: string | null } | null;
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** MLH seasons are named after the year they end in; the new season starts around August. */
function currentSeason(now = new Date()) {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

export async function fetchMlh(): Promise<Hackathon[]> {
  const html = await fetchText(`https://www.mlh.com/seasons/${currentSeason()}/events`);
  // The page is an Inertia app; its props (including the event list) are embedded as JSON.
  const match = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("MLH: could not find embedded event data");
  const page = JSON.parse(match[1]) as { props: { upcomingEvents?: MlhEvent[] } };
  return (page.props.upcomingEvents ?? []).map(normalize);
}

function countryName(code: string | null | undefined) {
  if (!code) return null;
  try {
    return COUNTRY_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function normalize(e: MlhEvent): Hackathon {
  const mode: Mode = e.formatType === "digital" ? "online" : e.formatType === "hybrid" ? "hybrid" : "offline";
  const v = e.venueAddress;
  return {
    id: `mlh:${e.id}`,
    source: "mlh",
    title: e.name.trim(),
    tagline: e.location ? `MLH member event · ${e.location}` : "MLH member event",
    url: e.websiteUrl || `https://www.mlh.com${e.url}`,
    image: e.logoUrl || e.backgroundUrl,
    mode,
    city: mode === "online" ? null : v?.city ?? e.location,
    state: mode === "online" ? null : v?.state ?? null,
    country: mode === "online" ? null : countryName(v?.country),
    venue: null,
    lat: null,
    lng: null,
    startsAt: iso(e.startsAt),
    endsAt: iso(e.endsAt),
    regStartsAt: null,
    regEndsAt: null,
    prizeText: null,
    prizeUsd: null,
    entryFee: "free",
    themes: inferThemes(e.name, (e.customFields?.hackathon_focus ?? []).join(" ")),
    organizer: "Major League Hacking",
    teamMin: null,
    teamMax: null,
  };
}
