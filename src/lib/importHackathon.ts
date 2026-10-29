import "server-only";
import { background } from "./request";
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { generateJson } from "./ai";
import { buildDetails, markReading } from "./details";
import { all } from "./db";
import { canonicalUrl } from "./urls";
import { isDate, isHttpUrl } from "./validation";
import { getDescription, getHackathon, trackHackathon, updateTracked, upsertHackathons } from "./repo";
import { fetchDevnovateEvent } from "./sources/devnovate";
import { fetchHack2skillEvent } from "./sources/hack2skill";
import { fetchUnstopEvent } from "./sources/unstop";
import { htmlToText, iso, parsePrizeUsd, USER_AGENT } from "./sources/util";
import { inferThemes, THEMES } from "./themes";
import type { Hackathon, ImportDraft, ImportPreview, Mode, ResultKind, TrackStatus } from "./types";

export class ImportError extends Error {}

/** Normalize the editable import form before any data is saved or background work starts. */
export function validateImportDraft(value: unknown): ImportDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ImportError("Missing hackathon details");
  const raw = value as Record<string, unknown>;
  if (typeof raw.title !== "string" || !raw.title.trim() || typeof raw.url !== "string") throw new ImportError("Give the hackathon a name and website field");
  if (raw.url.trim() && !isHttpUrl(raw.url.trim())) throw new ImportError("The website needs a full http:// or https:// link");
  if (!["online", "offline", "hybrid"].includes(raw.mode as string)) throw new ImportError("Pick online, in person or hybrid");
  const str = (key: string): string | null => {
    const v = raw[key];
    if (v == null || v === "") return null;
    if (typeof v !== "string") throw new ImportError(`${key} needs to be text`);
    return v.trim() || null;
  };
  const date = (key: string) => {
    const v = str(key);
    if (v === null) return null;
    if (!isDate(v)) throw new ImportError(`${key} needs a valid date`);
    return new Date(v).toISOString();
  };
  const team = (key: string): number | null => {
    const v = raw[key];
    if (v == null || v === "") return null;
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) throw new ImportError(`${key} needs a positive whole number`);
    return v;
  };
  const themes = raw.themes ?? [];
  if (!Array.isArray(themes) || !themes.every((t) => typeof t === "string" && (THEMES as readonly string[]).includes(t))) throw new ImportError("Pick valid hackathon themes");
  const draft: ImportDraft = {
    url: raw.url.trim(), title: raw.title.trim(), mode: raw.mode as Mode,
    tagline: str("tagline"), organizer: str("organizer"), city: str("city"), country: str("country"),
    startsAt: date("startsAt"), endsAt: date("endsAt"), regEndsAt: date("regEndsAt"),
    prizeText: str("prizeText"), image: str("image"), description: str("description"),
    themes: [...new Set(themes)], teamMin: team("teamMin"), teamMax: team("teamMax"),
  };
  if (draft.image && !isHttpUrl(draft.image)) throw new ImportError("The image needs a web address");
  if (draft.startsAt && draft.endsAt && draft.startsAt > draft.endsAt) throw new ImportError("The end date must follow the start date");
  if (draft.teamMin && draft.teamMax && draft.teamMin > draft.teamMax) throw new ImportError("The maximum team size must be at least the minimum");
  return draft;
}

// ---------- sites whose pages are empty until JavaScript runs ----------
//
// Unstop and Hack2skill event pages arrive as an empty shell, so reading them gives only the site's name. Their
// public event data (the same HackMate's feeds use) has the real title, dates, format, prizes and team size, and
// includes events that are already over, so a link to one of them is looked up there instead.

const SITES: { name: string; match: (u: URL) => string | null; fetch: (key: string) => Promise<Hackathon | null> }[] = [
  {
    name: "Unstop",
    // unstop.com/hackathons/<title>-<id>, unstop.com/competitions/..., unstop.com/o/<id>
    match: (u) => (/(^|\.)unstop\.com$/.test(u.hostname) ? (u.pathname.match(/-(\d{4,})\/?$/) ?? u.pathname.match(/^\/o\/(\d{4,})/))?.[1] ?? null : null),
    fetch: (id) => fetchUnstopEvent(id),
  },
  {
    name: "Hack2skill",
    // hack2skill.com/event/<slug>/
    match: (u) => (/(^|\.)hack2skill\.com$/.test(u.hostname) ? (u.pathname.match(/^\/event\/([\w-]+)\/?$/)?.[1] ?? null) : null),
    fetch: (slug) => fetchHack2skillEvent(slug),
  },
  {
    name: "Devnovate",
    // devnovate.co/event/<slug>
    match: (u) => (/(^|\.)devnovate\.co$/.test(u.hostname) ? (u.pathname.match(/^\/event\/([\w-]+)\/?$/)?.[1] ?? null) : null),
    fetch: (slug) => fetchDevnovateEvent(slug),
  },
];

/** The event from its site's own data, for links to a site above; null for any other link or when it isn't found. */
async function fromSite(url: URL): Promise<{ site: string; listing: Hackathon } | null> {
  for (const s of SITES) {
    const key = s.match(url);
    if (!key) continue;
    const listing = await s.fetch(key).catch((e: unknown) => {
      console.warn(`[import] ${s.name} lookup failed:`, (e as Error).message);
      return null;
    });
    return listing ? { site: s.name, listing } : null;
  }
  return null;
}

const draftOf = (h: Hackathon): ImportDraft => ({
  url: h.url, title: h.title, tagline: h.tagline, organizer: h.organizer, mode: h.mode, city: h.city, country: h.country,
  startsAt: h.startsAt, endsAt: h.endsAt, regEndsAt: h.regEndsAt, prizeText: h.prizeText, themes: h.themes,
  teamMin: h.teamMin, teamMax: h.teamMax, image: h.image,
});

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

async function findExisting(u: URL): Promise<string | null> {
  const target = canonicalUrl(u.href);
  const rows = (await all("SELECT id, url FROM hackathons")) as { id: string; url: string }[];
  for (const r of rows) {
    try {
      if (canonicalUrl(r.url) === target) return r.id;
    } catch {
      // A malformed stored URL can't match.
    }
  }
  return null;
}

/** Loopback, private, link-local, carrier-grade NAT and unique-local addresses: never fetched for an import. */
function privateAddress(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, "");
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}

/** The name must resolve only to public addresses, so a link can't reach this server's own network. */
async function assertPublic(u: URL) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addrs.length === 0) throw new Error("HTTP 0: name not found");
  if (addrs.some(privateAddress)) throw new ImportError("That link points at a private network address, not a public website.");
}

/** fetch, following up to 5 redirects by hand so each hop is checked too. */
async function fetchPublic(start: URL): Promise<string> {
  let url = start;
  for (let hop = 0; hop < 6; hop++) {
    checkUrl(url.toString());
    await assertPublic(url);
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const to = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && to) {
      url = new URL(to, url);
      continue;
    }
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return (await res.text()).slice(0, 2_000_000);
  }
  throw new Error("HTTP 0: too many redirects");
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
  const known = await fromSite(url);
  if (known) {
    // Already in HackMate from the feed (or added before) under the site's own id.
    const existingId = (await getHackathon(known.listing.id)) ? known.listing.id : await findExisting(new URL(known.listing.url));
    const d = draftOf(known.listing);
    const missing = !d.startsAt && !d.endsAt && !d.regEndsAt;
    return {
      draft: d,
      existingId,
      warning: missing ? `${known.site} doesn't list dates for this event. Add them below if you know them.` : null,
      readBy: "listing",
      site: known.site,
    };
  }
  if (SITES.some((s) => s.match(url))) {
    return {
      draft: EMPTY(url.toString(), url.hostname.replace(/^www\./, "")),
      existingId: await findExisting(url),
      warning: "Couldn't find this event in the site's data (check the link is to the event itself). Fill in the details below.",
      readBy: "none",
    };
  }
  const existingId = await findExisting(url);
  const fallbackTitle = url.hostname.replace(/^www\./, "");

  let html: string;
  try {
    html = await fetchPublic(url);
  } catch (e) {
    if (e instanceof ImportError) throw e;
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
export async function createFromDraft(d: ImportDraft, choice: ImportChoice): Promise<string> {
  // No link: a hackathon you're adding by hand, with whatever details you type.
  const url = d.url.trim() ? checkUrl(d.url) : null;
  // A link to a site with event data is saved as that site's listing (its id, link and description), so the feed
  // and the import never make two copies; your edits in the form still win.
  const existingId = url ? await findExisting(url) : null;
  const existing = existingId ? await getHackathon(existingId) : null;
  const known = existing ? { ...existing, description: await getDescription(existing.id) } : url ? ((await fromSite(url))?.listing ?? null) : null;
  const id =
    known?.id ??
    (url ? `custom:${createHash("sha1").update(canonicalUrl(url.href)!).digest("hex").slice(0, 12)}` : `custom:${randomUUID().replace(/-/g, "").slice(0, 12)}`);
  const title = d.title.trim().slice(0, 200) || url?.hostname || "Untitled hackathon";
  const h: Hackathon = {
    ...(known ?? {}),
    id,
    source: known?.source ?? "custom",
    title,
    tagline: d.tagline?.trim() || null,
    url: known?.url ?? url?.toString() ?? "",
    image: d.image,
    mode: d.mode,
    city: d.mode === "online" ? null : d.city?.trim() || null,
    state: null,
    country: d.mode === "online" ? null : d.country?.trim() || null,
    venue: known?.venue ?? null,
    lat: known?.lat ?? null,
    lng: known?.lng ?? null,
    startsAt: iso(d.startsAt),
    endsAt: iso(d.endsAt),
    regStartsAt: known?.regStartsAt ?? null,
    regEndsAt: iso(d.regEndsAt),
    prizeText: d.prizeText?.trim() || null,
    prizeUsd: known && d.prizeText === known.prizeText ? known.prizeUsd : parsePrizeUsd(d.prizeText),
    entryFee: known?.entryFee ?? null,
    themes: [...new Set([...d.themes, ...inferThemes(title, d.tagline)])],
    organizer: d.organizer?.trim() || null,
    teamMin: d.teamMin,
    teamMax: d.teamMax,
    description: d.description?.trim().slice(0, 20_000) || known?.description || null,
  };
  await upsertHackathons([h], new Date().toISOString());
  const trackedId = await trackHackathon(id);
  if (choice.status !== "interested" || choice.result) {
    await updateTracked(trackedId, { status: choice.status, ...(choice.status === "results" ? { result: choice.result ?? "participated" } : {}) });
  }
  // Fills Overview, rules, Ask AI and the submission checklist from the page, like any other hackathon.
  // Marked first, so opening it straight away shows "Reading the rules" instead of starting a second read.
  await markReading(trackedId);
  background("import", () => buildDetails(trackedId));
  return trackedId;
}
