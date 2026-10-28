import type { Hackathon } from "../types";
import { inferThemes } from "../themes";
import { absoluteUrl, jsonObjects, listing, rscText, stillRelevant } from "./shared";
import { fetchText, iso, stripHtml } from "./util";

interface LablabEvent {
  id: string; name: string; slug: string; type: string; eventType?: string;
  startAt?: string; endAt?: string; description?: string; thumbnailLink?: string; imageLink?: string;
  teamMembersMinimum?: number; teamMembersLimit?: number; deletedAt?: string | null;
}

export function parseLablab(html: string): Hackathon[] {
  const records = jsonObjects(rscText(html), '{"id":').filter((e) => typeof e.slug === "string" && typeof e.name === "string" && "startAt" in e);
  if (!records.length) throw new Error("lablab.ai: could not find embedded hackathon data");
  const events = new Map<string, Hackathon>();
  for (const raw of records) {
    const e = raw as unknown as LablabEvent;
    if (e.type !== "HACKATHON" || e.deletedAt) continue;
    const h = listing("lablab", e.id, e.name, `https://lablab.ai/ai-hackathons/${encodeURIComponent(e.slug)}`);
    events.set(h.id, { ...h, tagline: stripHtml(e.description), startsAt: iso(e.startAt), endsAt: iso(e.endAt),
      image: absoluteUrl(e.thumbnailLink || e.imageLink, "https://lablab.ai"),
      mode: e.eventType === "HYBRID" ? "hybrid" : e.eventType === "OFFLINE" || e.eventType === "IN_PERSON" ? "offline" : "online",
      entryFee: "free", themes: inferThemes(e.name, e.description, "artificial intelligence"), organizer: "lablab.ai",
      teamMin: e.teamMembersMinimum ?? null, teamMax: e.teamMembersLimit ?? null,
    });
  }
  return [...events.values()];
}

export async function fetchLablab(): Promise<Hackathon[]> {
  return parseLablab(await fetchText("https://lablab.ai/ai-hackathons")).filter((h) => stillRelevant(h));
}
