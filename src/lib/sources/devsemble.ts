import type { Hackathon } from "../types";
import { inferThemes } from "../themes";
import { absoluteUrl, listing, stillRelevant } from "./shared";
import { fetchJson, htmlToText, iso, parsePrizeUsd, stripHtml } from "./util";

interface DevsembleEvent {
  _id: string; slug: string; title: string; description?: string; bannerImage?: string;
  startDate?: string; endDate?: string; registrationDeadline?: string;
  venue?: string; mapEmbedQuery?: string; prizePool?: { title?: string; amount?: string }[];
  rules?: string[]; eligibility?: string; tags?: string[]; teamSize?: number;
  hostedBy?: { communityName?: string }; stages?: { name?: string; description?: string; startTime?: string; deadline?: string }[];
  isPublic?: boolean; isDeleted?: boolean;
}

export function normalizeDevsemble(e: DevsembleEvent): Hackathon {
  const venue = e.venue?.trim() || null;
  const online = !venue || /^(online|virtual|remote)(\b|$)/i.test(venue);
  const city = venue?.match(/\b(Noida|Delhi|Mumbai|Bengaluru|Bangalore|Hyderabad|Pune|Chennai|Kolkata)\b/i)?.[1] ?? null;
  const coordinates = e.mapEmbedQuery?.match(/^\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*$/);
  const lat = coordinates ? Number(coordinates[1]) : null;
  const lng = coordinates ? Number(coordinates[2]) : null;
  const prizes = (e.prizePool ?? []).map((p) => [p.title, p.amount].filter(Boolean).join(": ")).join("; ") || null;
  const details = [e.description, ...(e.rules ?? []), e.eligibility && `Eligibility: ${e.eligibility}`,
    ...(e.stages ?? []).map((s) => `${s.name ?? "Stage"}: ${s.description ?? ""}${s.deadline ? `\nDeadline: ${s.deadline}` : ""}`)].filter(Boolean).join("\n\n");
  return { ...listing("devsemble", e._id, e.title, `https://devsemble.com/hackathons/${encodeURIComponent(e.slug)}`),
    tagline: stripHtml(e.description), description: htmlToText(details) || null,
    image: absoluteUrl(e.bannerImage, "https://devsemble.com"),
    startsAt: iso(e.startDate), endsAt: iso(e.endDate), regEndsAt: iso(e.registrationDeadline),
    mode: online ? "online" : /hybrid/i.test(venue!) ? "hybrid" : "offline", venue: online ? null : venue, city: online ? null : city,
    lat: !online && lat !== null && Math.abs(lat) <= 90 && lng !== null && Math.abs(lng) <= 180 ? lat : null,
    lng: !online && lat !== null && Math.abs(lat) <= 90 && lng !== null && Math.abs(lng) <= 180 ? lng : null,
    prizeText: prizes, prizeUsd: parsePrizeUsd(prizes), themes: inferThemes(e.title, e.description, e.tags?.join(" ")),
    organizer: e.hostedBy?.communityName ?? null, teamMax: e.teamSize ?? null,
  };
}

export async function fetchDevsemble(): Promise<Hackathon[]> {
  const response = await fetchJson<{ hackathons: DevsembleEvent[] }>("https://devsemble.com/api/get-all-hackathons");
  if (!Array.isArray(response.hackathons)) throw new Error("Devsemble: unrecognized listing response");
  return [...new Map(response.hackathons.filter((e) => e._id && e.slug && e.title && e.isPublic !== false && !e.isDeleted)
    .map(normalizeDevsemble).filter((h) => stillRelevant(h)).map((h) => [h.id, h])).values()];
}
