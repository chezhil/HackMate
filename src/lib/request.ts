import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Public mode: set HACKMATE_REQUIRE_LOGIN=1 when HackMate is on the internet. Signed-out visitors can browse
 * hackathons and profiles, but anything personal needs an account (see withAccount in auth.ts). Off, as on your
 * own machine, signing out just means using the data kept on this computer.
 */
export function loginRequired(): boolean {
  return /^(1|true|yes)$/i.test(process.env.HACKMATE_REQUIRE_LOGIN ?? "");
}

// ---------- who's calling ----------

const client = new AsyncLocalStorage<{ ip: string }>();

export function withClient<T>(ip: string, fn: () => T): T {
  return client.run({ ip }, fn);
}

/** The caller's IP in this request, or null outside one (background jobs). */
export const clientIp = (): string | null => client.getStore()?.ip ?? null;

/** Behind Fly or Railway the real address is the first entry of X-Forwarded-For. */
export function ipOf(req: Request | undefined): string {
  const fwd = req?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req?.headers?.get?.("x-real-ip") || req?.headers?.get?.("fly-client-ip") || "local";
}

// ---------- rate limits ----------

/** In memory, per server: fine for one machine (SQLite means one machine anyway). A restart clears them. */
const hits = new Map<string, number[]>();

/** Record one use of `key`; false when it's already had `max` uses in the last `windowMs`. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

/**
 * Like allow(), for several windows at once (say per hour and per day): it's only used, in all of them, when
 * every one has room. Returns the rule that's full, or null when allowed.
 */
export function allowAll(rules: { key: string; max: number; windowMs: number }[]): { key: string; max: number; windowMs: number } | null {
  const now = Date.now();
  for (const r of rules) {
    const list = (hits.get(r.key) ?? []).filter((t) => now - t < r.windowMs);
    hits.set(r.key, list);
    if (list.length >= r.max) return r;
  }
  for (const r of rules) hits.get(r.key)!.push(now);
  return null;
}

/** When the oldest use in the window expires, i.e. when `key` can be used again. */
export function retryAt(key: string, windowMs: number): Date {
  const oldest = (hits.get(key) ?? [])[0] ?? Date.now();
  return new Date(oldest + windowMs);
}

export const tooMany = (message: string) => Response.json({ error: message }, { status: 429 });
