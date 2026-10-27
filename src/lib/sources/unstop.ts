import type { Hackathon, Mode } from "../types";
import { inferThemes } from "../themes";
import { fetchJson, iso, stripHtml, titleCase, toUsd } from "./util";

interface UnstopItem {
  id: number;
  title: string;
  region: string | null;
  seo_url: string;
  logoUrl2: string | null;
  details: string | null;
  end_date: string | null;
  isPaid: boolean;
  organisation?: { name: string } | null;
  prizes?: { cash: number | null; currency: string | null; currencyCode?: string | null }[];
  address_with_country_logo?: {
    address: string | null;
    city: string | null;
    state: string | null;
    country?: { name: string } | null;
    lat: number | string | null;
    lng: number | string | null;
  } | null;
  regnRequirements?: { start_regn_dt: string | null; end_regn_dt: string | null } | null;
  workfunction?: { name: string }[];
  required_skills?: { skill_name: string }[];
  filters?: { name: string; type: string }[];
}

interface UnstopPage {
  data: { data: UnstopItem[]; last_page: number };
}

const MAX_PAGES = 4;

export async function fetchUnstop(): Promise<Hackathon[]> {
  const items: UnstopItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchJson<UnstopPage>(
      `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&per_page=100&page=${page}`,
    );
    items.push(...res.data.data);
    if (page >= res.data.last_page) break;
  }
  return items.map(normalize);
}

function normalize(it: UnstopItem): Hackathon {
  const addr = it.address_with_country_logo ?? null;
  const mode: Mode = it.region === "offline" ? "offline" : it.region === "hybrid" ? "hybrid" : "online";
  const cash = (it.prizes ?? []).reduce((sum, p) => sum + (p.cash ?? 0), 0);
  const currency = (it.prizes ?? []).some((p) => /dollar|usd/i.test(`${p.currency} ${p.currencyCode}`)) ? "USD" : "INR";
  const lat = addr?.lat != null ? Number(addr.lat) : null;
  const lng = addr?.lng != null ? Number(addr.lng) : null;
  const tags = [
    ...(it.workfunction ?? []).map((w) => w.name),
    ...(it.required_skills ?? []).map((s) => s.skill_name),
  ];
  return {
    id: `unstop:${it.id}`,
    source: "unstop",
    title: it.title.trim(),
    tagline: stripHtml(it.details, 200),
    url: it.seo_url,
    image: it.logoUrl2 || null,
    mode,
    city: mode === "online" ? null : titleCase(addr?.city) || null,
    state: mode === "online" ? null : addr?.state || null,
    country: mode === "online" ? null : addr?.country?.name ?? null,
    venue: mode === "online" ? null : addr?.address || null,
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
    // Unstop's listing doesn't expose an event start, only registration dates and an end date.
    startsAt: null,
    endsAt: iso(it.end_date),
    regStartsAt: iso(it.regnRequirements?.start_regn_dt),
    regEndsAt: iso(it.regnRequirements?.end_regn_dt),
    prizeText: cash > 0 ? `${currency === "USD" ? "$" : "₹"}${cash.toLocaleString("en-IN")} in prizes` : null,
    prizeUsd: cash > 0 ? toUsd(cash, currency) : null,
    entryFee: it.isPaid ? "paid" : "free",
    themes: inferThemes(it.title, tags.join(" ")),
    organizer: it.organisation?.name ?? null,
  };
}
