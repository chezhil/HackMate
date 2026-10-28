import "server-only";
import { background } from "./request";
import { allScopes, getSetting, runAs, setSetting } from "./db";
import { geocodePending } from "./geocode";
import { syncAllAutoDeadlines, upsertHackathons } from "./repo";
import { fetchDevfolio } from "./sources/devfolio";
import { fetchMlh } from "./sources/mlh";
import { fetchUnstop } from "./sources/unstop";
import { fetchWeMakeDevs } from "./sources/wemakedevs";
import { fetchDevnovate } from "./sources/devnovate";
import { fetchDevpost } from "./sources/devpost";
import { fetchLablab } from "./sources/lablab";
import { fetchHackerEarth } from "./sources/hackerearth";
import { fetchHack2skill } from "./sources/hack2skill";
import { fetchDevsemble } from "./sources/devsemble";
import type { FeedSource, Hackathon } from "./types";

const FETCHERS: Record<FeedSource, () => Promise<Hackathon[]>> = {
  unstop: fetchUnstop,
  devfolio: fetchDevfolio,
  mlh: fetchMlh,
  wemakedevs: fetchWeMakeDevs,
  devsemble: fetchDevsemble,
  hack2skill: fetchHack2skill,
  hackerearth: fetchHackerEarth,
  lablab: fetchLablab,
  devpost: fetchDevpost,
  devnovate: fetchDevnovate,
};

export interface SyncReport {
  at: string;
  sources: Record<FeedSource, { ok: boolean; count: number; error?: string }>;
}

export const STALE_AFTER_MS = 6 * 3600_000;

let inFlight: Promise<SyncReport> | null = null;

export async function lastSync(): Promise<SyncReport | null> {
  const raw = await getSetting("lastSync");
  return raw ? (JSON.parse(raw) as SyncReport) : null;
}

const missingSources = (last: SyncReport | null) =>
  !last || Object.keys(FETCHERS).some((source) => !Object.hasOwn(last.sources, source));

/** Wait for an initial refresh when an app update adds a source to an existing installation. */
export async function needsInitialSync() {
  const last = await lastSync();
  return missingSources(last);
}

export async function isStale() {
  const last = await lastSync();
  return missingSources(last) || !last || Date.now() - new Date(last.at).getTime() > STALE_AFTER_MS;
}

/** Pull every feed, store the results, refresh tracked deadlines, then geocode in the background. */
export function syncAll(): Promise<SyncReport> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const at = new Date().toISOString();
    const entries = await Promise.all(
      (Object.keys(FETCHERS) as FeedSource[]).map(async (source) => {
        try {
          const list = await FETCHERS[source]();
          await upsertHackathons(list, at);
          return [source, { ok: true, count: list.length }] as const;
        } catch (e) {
          console.error(`[sync] ${source} failed:`, e);
          return [source, { ok: false, count: 0, error: (e as Error).message }] as const;
        }
      }),
    );
    // Every account's tracked deadlines follow the new dates, not just whoever pressed Refresh.
    for (const id of await allScopes()) await runAs(id, syncAllAutoDeadlines);
    const report: SyncReport = { at, sources: Object.fromEntries(entries) as SyncReport["sources"] };
    await setSetting("lastSync", JSON.stringify(report));
    background("geocode", geocodePending);
    return report;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
