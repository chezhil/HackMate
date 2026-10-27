export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 HackMate/0.1";

// Rough conversion rates, only used to compare prize pools across currencies.
const TO_USD: Record<string, number> = { USD: 1, INR: 1 / 88, EUR: 1.08, GBP: 1.27 };

export function toUsd(amount: number, currency: string): number {
  return Math.round(amount * (TO_USD[currency] ?? 1));
}

/** Parse strings like "$8000 in prizes", "₹20 Lakh", "₹1,00,000", "$15k" into USD. */
export function parsePrizeUsd(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/([$₹€£])\s?([\d,.]+)\s*(k|lakh|lac|l|cr|crore|m)?\b/i);
  if (!m) return null;
  const currency = { $: "USD", "₹": "INR", "€": "EUR", "£": "GBP" }[m[1]] ?? "USD";
  let n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = m[3]?.toLowerCase();
  if (unit === "k") n *= 1_000;
  else if (unit === "lakh" || unit === "lac" || unit === "l") n *= 100_000;
  else if (unit === "cr" || unit === "crore") n *= 10_000_000;
  else if (unit === "m") n *= 1_000_000;
  return toUsd(n, currency);
}

export function iso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function stripHtml(html: string | null | undefined, max = 240): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;|&mdash;/g, "–")
    .replace(/&#?\w+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return JSON.parse(await fetchText(url, init)) as T;
}

export function titleCase(s: string | null | undefined): string | null {
  if (!s) return null;
  return s
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
