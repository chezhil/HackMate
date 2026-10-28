import "server-only";
import { createHash } from "node:crypto";
import { generateJson } from "./ai";
import { buildDetails } from "./details";
import { db } from "./db";
import { getHackathon, trackHackathon, updateTracked, upsertHackathons } from "./repo";
import { fetchText, htmlToText, iso, parsePrizeUsd } from "./sources/util";
import { inferThemes, THEMES } from "./themes";
import type { Hackathon, Mode, ResultKind, TrackStatus } from "./types";

/** What the import form shows for you to check and edit before anything is saved. */
export interface ImportDraft {
  url: string;
  title: string;
  tagline: string | null;
  organizer: string | null;
  mode: Mode;
  city: string | null;
  country: string | null;
  startsAt: string | null;
  endsAt: string | null;
  regEndsAt: string | null;
  prizeText: string | null;
  themes: string[];
  teamMin: number | null;
  teamMax: number | null;
  image: string | null;
}

export interface ImportPreview {
  draft: ImportDraft;
  /** Already in HackMate (from a feed or added before): open that instead of making a copy. */
  existingId: string | null;
  /** Why the page couldn't be read, when it couldn't. The form is still offered, mostly empty. */
  warning: string | null;
  /** Whether the AI filled the fields, or only the page's own title and image tags. */
  readBy: "ai" | "page" | "none";
}

export class ImportError extends Error {}

/** Only public web pages: never this machine or the local network. */
function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("That doesn't look like a link. Paste the full address, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ImportError("Only web links (https://…) can be added.");
  const host = url.hostname.toLowerCase();
  const local =
    host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host === "0.0.0.0" || host === "[::1]" ||
    /^(127|10)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (local) throw new ImportError("That link points at this computer or a local network, not a public website.");
  url.hash = "";
  return url;
}

/** Same page regardless of tracking parameters, trailing slashes or www. */
function normalise(u: URL) {
  const keep = new URL(u.toString());
  for (const k of [...keep.searchParams.keys()]) if (/^(utm_|ref$|fbclid$|gclid$)/.test(k)) keep.searchParams.delete(k);
  return `${keep.hostname.replace(/^www\./, "")}${keep.pathname.replace(/\/+$/, "")}${keep.search}`.toLowerCase();
}

function findExisting(u: URL): string | null {
  const target = normalise(u);
  const rows = db().prepare("SELECT id, url FROM hackathons").all() as { id: string; url: string }[];
  for (const r of rows) {
    try {
      if (normalise(new URL(r.url)) === target) return r.id;
    } catch {
      // A malformed stored URL can't match.
    }
  }
  return null;
}

const meta = (html: string, name: string) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1] ??
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, "i"))?.[1] ??
  null;

const decode = (s: string | null) => s?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() || null;

const EMPTY = (url: string, title: string): ImportDraft => ({
  url, title, tagline: null, organizer: null, mode: "online", city: null, country: null, startsAt: null, endsAt: null,
  regEndsAt: null, prizeText: null, themes: [], teamMin: null, teamMax: null, image: null,
});

type Extracted = Partial<Omit<ImportDraft, "url" | "image">>;

/**
 * Read a hackathon's page into a draft. The page's own title / image tags fill what they can; the AI reads
 * the text for dates, format, place, prize and team size. A site that refuses automated reading gets a clear
 * message and an empty form; it is not worked around.
 */
export async function previewFromUrl(raw: string): Promise<ImportPreview> {
  const url = checkUrl(raw);
  const existingId = findExisting(url);
  const fallbackTitle = url.hostname.replace(/^www\./, "");

  let html: string;
  try {
    html = await fetchText(url.toString());
  } catch (e) {
    const status = Number((e as Error).message.match(/HTTP (\d{3})/)?.[1]);
    const warning =
      status === 401 || status === 403 || status === 429
        ? `This site doesn't let other apps read its pages (HTTP ${status}). Fill in the details below yourself.`
        : status
          ? `The page answered with HTTP ${status}. Check the link, or fill in the details below yourself.`
          : "Couldn't reach that page. Check the link, or fill in the details below yourself.";
    return { draft: EMPTY(url.toString(), fallbackTitle), existingId, warning, readBy: "none" };
  }

  const draft = EMPTY(url.toString(), decode(meta(html, "og:title")) ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null) ?? fallbackTitle);
  draft.tagline = decode(meta(html, "og:description") ?? meta(html, "description"))?.slice(0, 240) ?? null;
  const img = meta(html, "og:image");
  draft.image = img ? new URL(img, url).toString() : null;

  const body = htmlToText(html, 24_000);
  // Bot checks and error pages come back as normal pages; don't pretend they're the event.
  if (/just a moment|checking your browser|enable javascript and cookies|attention required|access denied|verify you are human|captcha|page not found|404 not found/i.test(body.slice(0, 2000))) {
    return {
      draft: { ...draft, title: fallbackTitle, tagline: null, image: null },
      existingId,
      warning: "That site showed a check or error page instead of the event, so nothing could be read. Fill in the details below yourself.",
      readBy: "none",
    };
  }
  // Pages that build themselves with JavaScript have little body text, but their title and description tags often
  // carry the dates and format ("September 18-20, 2026 · 36 hours, in person"), so those go to the AI as well.
  const text = [`Page title: ${draft.title}`, draft.tagline && `Page description: ${draft.tagline}`, body].filter(Boolean).join("\n\n");
  if (text.length < 80) {
    return { draft, existingId, warning: "The page has almost no text (it may load its content with JavaScript). Fill in the details below.", readBy: "page" };
  }

  try {
    const res = await generateJson<Extracted>({
      task: "extract",
      temperature: 0.1,
      system: `You read a hackathon's web page and pull out its listing details. Reply with JSON:
{ "title": string, "tagline": string|null (one sentence), "organizer": string|null, "mode": "online"|"offline"|"hybrid",
  "city": string|null, "country": string|null, "startsAt": ISO date|null, "endsAt": ISO date|null, "regEndsAt": ISO date|null,
  "prizeText": string|null (e.g. "$10,000 in prizes"), "themes": string[] (only from: ${THEMES.join(", ")}),
  "teamMin": number|null, "teamMax": number|null }
Use only what the page says; null when it doesn't say. Dates as YYYY-MM-DD, or with a time if given.`,
      messages: [{ role: "user", content: `URL: ${url}\n\n${text}` }],
      // Two people pasting the same page get one AI read.
      cache: { ttlDays: 7 },
    });
    const x = res.data;
    const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 100 ? Math.round(v) : null);
    Object.assign(draft, {
      title: str(x.title) ?? draft.title,
      tagline: str(x.tagline, 240) ?? draft.tagline,
      organizer: str(x.organizer),
      mode: x.mode === "offline" || x.mode === "hybrid" ? x.mode : "online",
      city: str(x.city, 80),
      country: str(x.country, 80),
      startsAt: iso(str(x.startsAt, 40)),
      endsAt: iso(str(x.endsAt, 40)),
      regEndsAt: iso(str(x.regEndsAt, 40)),
      prizeText: str(x.prizeText, 120),
      themes: Array.isArray(x.themes) ? x.themes.filter((t): t is string => (THEMES as readonly string[]).includes(t as string)) : [],
      teamMin: num(x.teamMin),
      teamMax: num(x.teamMax),
    });
    // Nothing event-like came out: probably not the event's own page.
    const found = [draft.startsAt, draft.endsAt, draft.regEndsAt, draft.organizer, draft.prizeText, draft.city].some(Boolean);
    const thin = body.length < 600;
    const warning = !found
      ? "Couldn't find dates, prizes or an organizer on that page. Check it's the event's own page, or fill in the details below."
      : thin
        ? "The page loads most of its content with JavaScript, so only its summary could be read. Check the details below."
        : null;
    return { draft, existingId, warning, readBy: "ai" };
  } catch (e) {
    console.warn("[import] AI read failed:", (e as Error).message);
    return { draft, existingId, warning: "Couldn't read the details with AI just now, so only the page title came through. Fill in the rest below.", readBy: "page" };
  }
}

export interface ImportChoice {
  status: TrackStatus;
  result: ResultKind | null;
}

/**
 * Save a checked draft as a hackathon "Added by you", pin it at the chosen stage, and start reading its full
 * rules in the background so Overview, Ask AI and the checklist work like for any other hackathon.
 */
export function createFromDraft(d: ImportDraft, choice: ImportChoice): string {
  const url = checkUrl(d.url);
  const id = `custom:${createHash("sha1").update(normalise(url)).digest("hex").slice(0, 12)}`;
  const title = d.title.trim().slice(0, 200) || url.hostname;
  const h: Hackathon = {
    id,
    source: "custom",
    title,
    tagline: d.tagline?.trim() || null,
    url: url.toString(),
    image: d.image,
    mode: d.mode,
    city: d.mode === "online" ? null : d.city?.trim() || null,
    state: null,
    country: d.mode === "online" ? null : d.country?.trim() || null,
    venue: null,
    lat: null,
    lng: null,
    startsAt: iso(d.startsAt),
    endsAt: iso(d.endsAt),
    regStartsAt: null,
    regEndsAt: iso(d.regEndsAt),
    prizeText: d.prizeText?.trim() || null,
    prizeUsd: parsePrizeUsd(d.prizeText),
    entryFee: null,
    themes: [...new Set([...d.themes, ...inferThemes(title, d.tagline)])],
    organizer: d.organizer?.trim() || null,
    teamMin: d.teamMin,
    teamMax: d.teamMax,
  };
  upsertHackathons([h], new Date().toISOString());
  trackHackathon(id);
  if (choice.status !== "interested" || choice.result) {
    updateTracked(id, { status: choice.status, ...(choice.status === "results" ? { result: choice.result ?? "participated" } : {}) });
  }
  // Fills Overview, rules, Ask AI and the submission checklist from the page, like any other hackathon.
  void buildDetails(id).catch((e) => console.warn("[import] reading rules failed for", id, (e as Error).message));
  return getHackathon(id)!.id;
}
