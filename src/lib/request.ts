import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { after } from "next/server";
import { currentScope, get, run, runAs, withLocks } from "./db";

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

/** Behind a proxy (Vercel, or a host in front of Docker) the real address is the first entry of X-Forwarded-For. */
export function ipOf(req: Request | undefined): string {
  const fwd = req?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req?.headers?.get?.("x-real-ip") || "local";
}

// ---------- after the response ----------

/**
 * Work that can finish after the response (reading a hackathon's rules, geocoding, a feed refresh). On Vercel a
 * function stops when it responds unless the work is handed to after(); it keeps the same account and caller.
 * Outside a request (tests, scripts) it just runs.
 */
export function background(label: string, fn: () => Promise<unknown>) {
  const who = currentScope();
  const ip = clientIp();
  const job = () => withClient(ip ?? "local", () => runAs(who, fn)).then(
    () => undefined,
    (e: unknown) => console.error(`[${label}]`, e),
  );
  try {
    after(job);
  } catch {
    void job();
  }
}

// ---------- rate limits ----------
//
// Kept in the database (rate_hits), so every server instance shares the same count: on Vercel each request can
// land on a different one.

const since = (windowMs: number) => new Date(Date.now() - windowMs).toISOString();

/** How many times `key` was used in the last `windowMs`. */
export async function used(key: string, windowMs: number): Promise<number> {
  const r = await get<{ n: number }>("SELECT COUNT(*)::int AS n FROM rate_hits WHERE key = ? AND at > ?", key, since(windowMs));
  return r?.n ?? 0;
}

/** Count one use of each key, without checking a limit. */
export async function record(keys: string[]) {
  for (const key of keys) await run("INSERT INTO rate_hits (key) VALUES (?)", key);
  // Now and then, forget anything older than the longest window (a day).
  if (Math.random() < 0.02) await run("DELETE FROM rate_hits WHERE at < ?", since(2 * 86_400_000));
}

/** Record one use of `key`; false when it's already had `max` uses in the last `windowMs`. */
export async function allow(key: string, max: number, windowMs: number): Promise<boolean> {
  return (await allowAll([{ key, max, windowMs }])) === null;
}

/**
 * Like allow(), for several windows at once (say per hour and per day): it's only used, in all of them, when
 * every one has room. Returns the rule that's full, or null when allowed.
 */
export async function allowAll(rules: { key: string; max: number; windowMs: number }[]): Promise<{ key: string; max: number; windowMs: number } | null> {
  return withLocks(rules.map((r) => `rate:${r.key}`), async () => {
    for (const r of rules) if ((await used(r.key, r.windowMs)) >= r.max) return r;
    await record(rules.map((r) => r.key));
    return null;
  });
}

/** Forget the uses of `key` (say, failed sign-ins once the right password comes in). */
export async function clearUses(key: string) {
  await run("DELETE FROM rate_hits WHERE key = ?", key);
}

/** When the oldest use in the window expires, i.e. when `key` can be used again. */
export async function retryAt(key: string, windowMs: number): Promise<Date> {
  const r = await get<{ at: Date | string | null }>("SELECT MIN(at) AS at FROM rate_hits WHERE key = ? AND at > ?", key, since(windowMs));
  return new Date(new Date(r?.at ?? Date.now()).getTime() + windowMs);
}

export const tooMany = (message: string) => Response.json({ error: message }, { status: 429 });
