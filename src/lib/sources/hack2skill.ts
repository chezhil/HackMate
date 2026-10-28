import type { Hackathon } from "../types";
import { inferThemes } from "../themes";
import { absoluteUrl, listing, stillRelevant } from "./shared";
import { fetchJson, iso } from "./util";

interface Hack2skillEvent {
  _id: string; eventUrl: string; title: string; thumbnail?: string;
  registrationStart?: string; registrationEnd?: string; submissionStart?: string; submissionEnd?: string;
  ticket?: string; mode?: string; participation?: string;
}
interface Hack2skillPage { success: boolean; data: Hack2skillEvent[]; pages: number }

export function normalizeHack2skill(e: Hack2skillEvent): Hackathon {
  const url = /^https?:\/\//.test(e.eventUrl) ? absoluteUrl(e.eventUrl, "https://hack2skill.com") : `https://hack2skill.com/event/${encodeURIComponent(e.eventUrl)}`;
  return { ...listing("hack2skill", e._id, e.title, url!),
    image: absoluteUrl(e.thumbnail, "https://hack2skill.com"),
    startsAt: iso(e.submissionStart), endsAt: iso(e.submissionEnd),
    regStartsAt: iso(e.registrationStart), regEndsAt: iso(e.registrationEnd),
    mode: e.mode === "HYBRID" ? "hybrid" : e.mode === "IN_PERSON" || e.mode === "OFFLINE" ? "offline" : "online",
    entryFee: e.ticket === "FREE" ? "free" : e.ticket === "PAID" ? "paid" : null,
    themes: inferThemes(e.title), teamMin: e.participation === "Individual" ? 1 : null,
    teamMax: e.participation === "Individual" ? 1 : null,
  };
}

export async function fetchHack2skill(): Promise<Hackathon[]> {
  const events = new Map<string, Hackathon>();
  for (let page = 1; page <= 15; page++) {
    const response = await fetchJson<Hack2skillPage>(`https://hack2skill.com/api/v1/innovator/public/event/public-list?page=${page}&records=100`);
    if (response.success !== true || !Array.isArray(response.data) || !Number.isInteger(response.pages) || response.pages < 0) throw new Error("Hack2skill: unrecognized listing response");
    for (const e of response.data) {
      if (!e._id || !e.title || !e.eventUrl) continue;
      const h = normalizeHack2skill(e);
      if (stillRelevant(h)) events.set(h.id, h);
    }
    if (page >= response.pages || response.data.length === 0) return [...events.values()];
  }
  throw new Error("Hack2skill: listing exceeded the pagination limit");
}
