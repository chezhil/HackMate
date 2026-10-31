import { THEMES } from "@/lib/themes";
import type { Hackathon, Mode, Source } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

/** Everything the Discover filters can be set to. It round-trips through the URL, so a filtered view can be shared and survives Back. */
export interface Filters {
  q: string;
  sources: Source[];
  mode: Mode | "all";
  city: string;
  themes: string[];
  minPrize: number;
  freeOnly: boolean;
  when: When;
  length: Length;
  hideClashing: boolean;
  sort: Sort;
  view: View;
}

export type When = "any" | "7" | "30" | "reg";
export type Length = "any" | "short" | "week" | "long";
export type Sort = "soonest" | "prize" | "regClosing";
export type View = "split" | "list" | "map";

export const DEFAULTS: Filters = {
  q: "", sources: [], mode: "all", city: "", themes: [], minPrize: 0, freeOnly: false,
  when: "any", length: "any", hideClashing: false, sort: "soonest", view: "split",
};

export const PRIZE_OPTIONS = [
  { value: 0, label: "Any prize" },
  { value: 1, label: "Has cash prize" },
  { value: 1000, label: "$1k+" },
  { value: 5000, label: "$5k+" },
  { value: 10000, label: "$10k+" },
];

export const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
  { value: "reg", label: "Registration open" },
];

export const LENGTH_OPTIONS: { value: Length; label: string }[] = [
  { value: "any", label: "Any length" },
  { value: "short", label: "Up to 2 days" },
  { value: "week", label: "3 to 7 days" },
  { value: "long", label: "Over a week" },
];

export const MODE_OPTIONS: { value: Mode | "all"; label: string }[] = [
  { value: "all", label: "Online + offline" },
  { value: "online", label: "Online only" },
  { value: "offline", label: "In person only" },
  { value: "hybrid", label: "In person, online optional" },
];

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function parseFilters(p: URLSearchParams): Filters {
  return {
    q: p.get("q") ?? "",
    sources: list(p.get("src")).filter((s): s is Source => Object.hasOwn(SOURCE_LABELS, s)),
    mode: pick(p.get("mode"), ["all", "online", "offline", "hybrid"] as const, "all"),
    city: p.get("city") ?? "",
    themes: list(p.get("themes")).filter((t) => (THEMES as readonly string[]).includes(t)),
    minPrize: Number.isFinite(Number(p.get("prize"))) ? Math.max(0, Number(p.get("prize"))) : 0,
    freeOnly: p.get("free") === "1",
    when: pick(p.get("when"), ["any", "7", "30", "reg"] as const, "any"),
    length: pick(p.get("len"), ["any", "short", "week", "long"] as const, "any"),
    hideClashing: p.get("noclash") === "1",
    sort: pick(p.get("sort"), ["soonest", "prize", "regClosing"] as const, "soonest"),
    view: pick(p.get("view"), ["split", "list", "map"] as const, "split"),
  };
}

/** Only non-default values go in the URL, so a plain Discover link stays plain. */
export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.sources.length) p.set("src", f.sources.join(","));
  if (f.mode !== "all") p.set("mode", f.mode);
  if (f.city) p.set("city", f.city);
  if (f.themes.length) p.set("themes", f.themes.join(","));
  if (f.minPrize) p.set("prize", String(f.minPrize));
  if (f.freeOnly) p.set("free", "1");
  if (f.when !== "any") p.set("when", f.when);
  if (f.length !== "any") p.set("len", f.length);
  if (f.hideClashing) p.set("noclash", "1");
  if (f.sort !== "soonest") p.set("sort", f.sort);
  if (f.view !== "split") p.set("view", f.view);
  return p.toString();
}

const DAY = 86_400_000;

function lengthOf(h: Hackathon): Length | null {
  if (!h.startsAt || !h.endsAt) return null;
  const days = (new Date(h.endsAt).getTime() - new Date(h.startsAt).getTime()) / DAY;
  return days <= 2 ? "short" : days <= 7 ? "week" : "long";
}

function startOf(h: Hackathon) {
  return new Date(h.startsAt ?? h.endsAt ?? 0).getTime();
}

export function matches(h: Hackathon, f: Filters, now: number): boolean {
  const needle = f.q.trim().toLowerCase();
  if (needle && !`${h.title} ${h.tagline ?? ""} ${h.organizer ?? ""} ${h.city ?? ""}`.toLowerCase().includes(needle)) return false;
  if (f.sources.length && !f.sources.includes(h.source) && !h.sourceListings?.some((s) => f.sources.includes(s.source))) return false;
  if (f.mode !== "all" && h.mode !== f.mode) return false;
  if (f.city && h.city !== f.city) return false;
  if (f.themes.length && !h.themes.some((t) => f.themes.includes(t))) return false;
  if (f.minPrize && (h.prizeUsd ?? 0) < f.minPrize) return false;
  if (f.freeOnly && h.entryFee !== "free") return false;
  if (f.when === "reg" && (!(h.regEndsAt && new Date(h.regEndsAt).getTime() > now)
    || (h.regStartsAt && new Date(h.regStartsAt).getTime() > now))) return false;
  if (f.when === "7" || f.when === "30") {
    const start = startOf(h);
    if ((!h.startsAt && !h.endsAt) || !Number.isFinite(start) || start < now || start > now + Number(f.when) * DAY) return false;
  }
  if (f.length !== "any" && lengthOf(h) !== f.length) return false;
  return true;
}

const time = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
const ahead = (iso: string | null, now: number) => {
  const t = time(iso);
  return Number.isFinite(t) && t >= now ? t : Infinity;
};

/** Over: the last date it lists (end, else registration close, else start) has passed. No dates at all: not over. */
export function isOver(h: Hackathon, now: number): boolean {
  const last = time(h.endsAt ?? h.regEndsAt ?? h.startsAt);
  return Number.isFinite(last) && last < now;
}

/**
 * The next thing that happens: registration closing, the start, or the end, whichever is still ahead. An event
 * that's already running sorts by when it ends, not by a start months ago; one with no dates goes last.
 */
function nextDate(h: Hackathon, now: number): number {
  return Math.min(ahead(h.regEndsAt, now), ahead(h.startsAt, now), ahead(h.endsAt, now));
}

export function sortHackathons(list: Hackathon[], sort: Sort, now = Date.now()) {
  const byNext = (a: Hackathon, b: Hackathon) => {
    const x = nextDate(a, now), y = nextDate(b, now);
    return x === y ? a.title.localeCompare(b.title) : x === Infinity ? 1 : y === Infinity ? -1 : x - y;
  };
  return list.sort((a, b) => {
    if (sort === "prize") return (b.prizeUsd ?? 0) - (a.prizeUsd ?? 0) || byNext(a, b);
    if (sort === "regClosing") {
      // Open registrations by how soon they close; closed or unknown ones after, soonest first among them.
      const x = ahead(a.regEndsAt, now), y = ahead(b.regEndsAt, now);
      if (x !== y) return x === Infinity ? 1 : y === Infinity ? -1 : x - y;
    }
    return byNext(a, b);
  });
}

export interface ActiveFilter {
  key: string;
  label: string;
  clear: (f: Filters) => Filters;
}

/** One removable chip per active filter, in the order the filter panel lists them. */
export function activeFilters(f: Filters): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (f.q.trim()) out.push({ key: "q", label: `“${f.q.trim()}”`, clear: (x) => ({ ...x, q: "" }) });
  if (f.mode !== "all") out.push({ key: "mode", label: MODE_OPTIONS.find((o) => o.value === f.mode)!.label, clear: (x) => ({ ...x, mode: "all" }) });
  if (f.city) out.push({ key: "city", label: f.city, clear: (x) => ({ ...x, city: "" }) });
  if (f.minPrize) out.push({ key: "prize", label: PRIZE_OPTIONS.find((o) => o.value === f.minPrize)?.label ?? `$${f.minPrize}+`, clear: (x) => ({ ...x, minPrize: 0 }) });
  if (f.when !== "any") out.push({ key: "when", label: WHEN_OPTIONS.find((o) => o.value === f.when)!.label, clear: (x) => ({ ...x, when: "any" }) });
  if (f.length !== "any") out.push({ key: "len", label: LENGTH_OPTIONS.find((o) => o.value === f.length)!.label, clear: (x) => ({ ...x, length: "any" }) });
  for (const t of f.themes) out.push({ key: `t:${t}`, label: t, clear: (x) => ({ ...x, themes: x.themes.filter((y) => y !== t) }) });
  for (const s of f.sources) out.push({ key: `s:${s}`, label: SOURCE_LABELS[s], clear: (x) => ({ ...x, sources: x.sources.filter((y) => y !== s) }) });
  if (f.freeOnly) out.push({ key: "free", label: "Free entry", clear: (x) => ({ ...x, freeOnly: false }) });
  if (f.hideClashing) out.push({ key: "noclash", label: "No clashes", clear: (x) => ({ ...x, hideClashing: false }) });
  return out;
}

/** Clears every filter but keeps how the results are shown. */
export const clearAll = (f: Filters): Filters => ({ ...DEFAULTS, sort: f.sort, view: f.view });
