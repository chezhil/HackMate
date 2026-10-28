import type { Hackathon, Source } from "../types";
import { iso } from "./util";

/** Defaults for fields a listing does not publish; unknown fees and prizes stay unknown. */
export function listing(source: Source, id: string, title: string, url: string): Hackathon {
  return {
    id: `${source}:${id}`, source, title: title.trim(), url,
    tagline: null, image: null, mode: "online", city: null, state: null, country: null,
    venue: null, lat: null, lng: null, startsAt: null, endsAt: null,
    regStartsAt: null, regEndsAt: null, prizeText: null, prizeUsd: null,
    entryFee: null, themes: [], organizer: null, teamMin: null, teamMax: null,
  };
}

export function absoluteUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

/** HackerEarth explicitly labels its offset-free timestamps as UTC. */
export function utcIso(value: string | null | undefined): string | null {
  return iso(value && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value);
}

export function stillRelevant(h: Hackathon, now = Date.now()): boolean {
  const last = h.endsAt ?? h.regEndsAt;
  return !last || new Date(last).getTime() >= now;
}

/** Read RSC string records as JSON data, never executable JavaScript. */
export function rscText(html: string): string {
  const chunks: string[] = [];
  for (const match of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try {
      const record: unknown = JSON.parse(match[1]);
      if (Array.isArray(record) && record[0] === 1 && typeof record[1] === "string") chunks.push(record[1]);
    } catch { /* Non-data scripts do not form part of the listing. */ }
  }
  return chunks.join("");
}

/** Extract balanced JSON objects, respecting quotes and escapes inside descriptions. */
export function jsonObjects(text: string, prefix: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(prefix, from);
    if (start < 0) break;
    let depth = 0;
    let quoted = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === "\\") i++;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try { objects.push(JSON.parse(text.slice(start, i + 1))); } catch { /* Skip incomplete records. */ }
        break;
      }
    }
    from = start + prefix.length;
  }
  return objects;
}
