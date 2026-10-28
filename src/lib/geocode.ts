import "server-only";
import { get, run } from "./db";
import { hackathonsNeedingGeocode, setCoords } from "./repo";

// OpenStreetMap Nominatim: free, but limited to one request per second and wants a descriptive User-Agent.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "HackMate/0.1 (hackathon tracker; local app)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cached(query: string): Promise<{ lat: number | null; lng: number | null } | undefined> {
  return (await get("SELECT lat, lng FROM geocache WHERE query = ?", query)) as
    | { lat: number | null; lng: number | null }
    | undefined;
}

async function lookup(query: string): Promise<{ lat: number; lng: number } | null> {
  const hit = await cached(query);
  if (hit) return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng } : null;
  const url = `${NOMINATIM}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const [first] = (await res.json()) as { lat: string; lon: string }[];
  const result = first ? { lat: Number(first.lat), lng: Number(first.lon) } : null;
  (await run("INSERT INTO geocache (query, lat, lng) VALUES (?, ?, ?) ON CONFLICT (query) DO UPDATE SET lat = excluded.lat, lng = excluded.lng", query, result?.lat ?? null, result?.lng ?? null));
  return result;
}

let running = false;

/** Fill in map coordinates for in-person hackathons. Runs in the background after a sync. */
export async function geocodePending(): Promise<number> {
  if (running) return 0;
  running = true;
  let done = 0;
  try {
    for (const h of await hackathonsNeedingGeocode()) {
      const query = [h.city, h.state, h.country].filter(Boolean).join(", ");
      const wasCached = await cached(query) !== undefined;
      try {
        const coords = await lookup(query);
        if (coords) {
          await setCoords(h.id, coords.lat, coords.lng);
          done++;
        }
      } catch (e) {
        console.warn("[geocode]", query, (e as Error).message);
      }
      if (!wasCached) await sleep(1100);
    }
  } finally {
    running = false;
  }
  return done;
}
