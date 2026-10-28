import "server-only";
import { aiPolicy } from "./aiPolicy";
import { deduplicateHackathons, sameHackathon } from "./deduplicate";
import { all, get, run, tx, withAccountLock } from "./db";
import type {
  Deadline,
  DeadlineKind,
  Hackathon,
  ResultKind,
  Tracked,
  TrackedWithHackathon,
  TrackStatus,
} from "./types";
import { DEADLINE_LABELS, STATUSES } from "./types";

type Row = Record<string, unknown>;
type GeocodeCandidate = { id: string; city: string; state: string | null; country: string | null };

function toHackathon(r: Row): Hackathon {
  return {
    id: r.id as string,
    source: r.source as Hackathon["source"],
    title: r.title as string,
    tagline: (r.tagline as string) ?? null,
    url: r.url as string,
    image: (r.image as string) ?? null,
    mode: r.mode as Hackathon["mode"],
    city: (r.city as string) ?? null,
    state: (r.state as string) ?? null,
    country: (r.country as string) ?? null,
    venue: (r.venue as string) ?? null,
    lat: (r.lat as number) ?? null,
    lng: (r.lng as number) ?? null,
    startsAt: (r.starts_at as string) ?? null,
    endsAt: (r.ends_at as string) ?? null,
    regStartsAt: (r.reg_starts_at as string) ?? null,
    regEndsAt: (r.reg_ends_at as string) ?? null,
    prizeText: (r.prize_text as string) ?? null,
    prizeUsd: (r.prize_usd as number) ?? null,
    entryFee: (r.entry_fee as Hackathon["entryFee"]) ?? null,
    themes: JSON.parse((r.themes as string) || "[]"),
    organizer: (r.organizer as string) ?? null,
    teamMin: (r.team_min as number) ?? null,
    teamMax: (r.team_max as number) ?? null,
  };
}

function toTracked(r: Row): Tracked {
  return {
    hackathonId: r.hackathon_id as string,
    status: r.status as TrackStatus,
    pinnedAt: r.pinned_at as string,
    registeredAt: (r.registered_at as string) ?? null,
    submittedAt: (r.submitted_at as string) ?? null,
    submissionUrl: (r.submission_url as string) ?? null,
    result: (r.result as ResultKind) ?? null,
    resultNotes: (r.result_notes as string) ?? null,
    notes: (r.notes as string) ?? null,
  };
}

function toDeadline(r: Row): Deadline {
  return {
    id: r.id as number,
    hackathonId: r.hackathon_id as string,
    kind: r.kind as DeadlineKind,
    label: r.label as string,
    dueAt: r.due_at as string,
    auto: Boolean(r.auto),
    done: Boolean(r.done),
  };
}

// ---------- hackathons ----------

const HACKATHON_COLUMNS =
  "id, source, title, tagline, url, image, mode, city, state, country, venue, lat, lng, starts_at, ends_at, reg_starts_at, reg_ends_at, prize_text, prize_usd, entry_fee, themes, organizer, last_seen_at, description, team_min, team_max";

/** Insert or refresh hackathons from a feed, 100 rows per statement so a sync is a handful of round trips. */
export async function upsertHackathons(list: Hackathon[], seenAt: string) {
  // A listing can shift between pages while a feed is fetched. Postgres rejects repeated IDs in one INSERT.
  list = [...new Map(list.map((h) => [h.id, h])).values()];
  const width = HACKATHON_COLUMNS.split(",").length;
  await tx(async () => {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const values = chunk.map(() => `(${Array.from({ length: width }, () => "?").join(", ")})`).join(",\n");
      const params = chunk.flatMap((h) => [
        h.id, h.source, h.title, h.tagline, h.url, h.image, h.mode, h.city, h.state, h.country, h.venue,
        h.lat, h.lng, h.startsAt, h.endsAt, h.regStartsAt, h.regEndsAt, h.prizeText, h.prizeUsd,
        h.entryFee, JSON.stringify(h.themes), h.organizer, seenAt,
        h.description ?? null, h.teamMin, h.teamMax,
      ]);
      await run(
        `INSERT INTO hackathons (${HACKATHON_COLUMNS}) VALUES ${values}
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, tagline = excluded.tagline, url = excluded.url, image = excluded.image,
           mode = excluded.mode, city = excluded.city, state = excluded.state, country = excluded.country,
           venue = excluded.venue,
           -- keep coordinates we geocoded earlier unless the feed now gives exact ones
           lat = COALESCE(excluded.lat, CASE WHEN hackathons.city IS NOT DISTINCT FROM excluded.city THEN hackathons.lat END),
           lng = COALESCE(excluded.lng, CASE WHEN hackathons.city IS NOT DISTINCT FROM excluded.city THEN hackathons.lng END),
           starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           reg_starts_at = excluded.reg_starts_at, reg_ends_at = excluded.reg_ends_at,
           prize_text = excluded.prize_text, prize_usd = excluded.prize_usd, entry_fee = excluded.entry_fee,
           themes = excluded.themes, organizer = excluded.organizer, last_seen_at = excluded.last_seen_at,
           description = excluded.description, team_min = excluded.team_min, team_max = excluded.team_max`,
        ...params,
      );
    }
  });
}

/** Hackathons that haven't ended yet (or have no end date), plus anything being tracked. */
export async function listHackathons(): Promise<Hackathon[]> {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  // The full rules, when available, take precedence over the feed description for the AI policy.
  const rows = await all(
    `SELECT h.*, COALESCE(d.source_text, h.description) AS policy_text FROM hackathons h
     LEFT JOIN hackathon_details d ON d.hackathon_id = h.id
     WHERE h.ends_at IS NULL OR h.ends_at >= ? OR h.id IN (SELECT hackathon_id FROM tracked)
     ORDER BY COALESCE(h.starts_at, h.ends_at) ASC`,
    cutoff,
  );
  const list = rows.map((row) => ({ ...toHackathon(row), aiPolicy: aiPolicy(row.policy_text as string | null) }));
  const tracked = await all<{ hackathon_id: string }>("SELECT hackathon_id FROM tracked");
  const trackedIds = new Set(tracked.map((row) => row.hackathon_id));
  return deduplicateHackathons(list, trackedIds);
}

export async function getDescription(id: string): Promise<string | null> {
  const r = await get<{ description: string | null }>("SELECT description FROM hackathons WHERE id = ?", id);
  return r?.description ?? null;
}

export async function getHackathon(id: string): Promise<Hackathon | null> {
  const r = await get("SELECT * FROM hackathons WHERE id = ?", id);
  return r ? toHackathon(r) : null;
}

export async function hackathonsNeedingGeocode(): Promise<GeocodeCandidate[]> {
  return all<GeocodeCandidate>(
    `SELECT id, city, state, country FROM hackathons
     WHERE mode != 'online' AND city IS NOT NULL AND city != '' AND lat IS NULL`,
  );
}

export async function setCoords(id: string, lat: number, lng: number) {
  await run("UPDATE hackathons SET lat = ?, lng = ? WHERE id = ?", lat, lng, id);
}

// ---------- tracker ----------

export async function listTracked(): Promise<TrackedWithHackathon[]> {
  const rows = await all(`SELECT t.*, h.* FROM tracked t JOIN hackathons h ON h.id = t.hackathon_id
       ORDER BY COALESCE(h.starts_at, h.ends_at) ASC`);
  const deadlinesByHackathon = new Map<string, Deadline[]>();
  for (const row of await all("SELECT * FROM deadlines ORDER BY due_at ASC")) {
    const deadline = toDeadline(row);
    const group = deadlinesByHackathon.get(deadline.hackathonId);
    if (group) group.push(deadline);
    else deadlinesByHackathon.set(deadline.hackathonId, [deadline]);
  }
  return rows.map((r) => ({
    ...toTracked(r),
    hackathon: toHackathon(r),
    deadlines: deadlinesByHackathon.get(r.hackathon_id as string) ?? [],
  }));
}

export async function trackHackathon(id: string) {
  return withAccountLock("tracker", async () => {
    const candidate = await getHackathon(id);
    if (!candidate) throw new Error("Unknown hackathon");
    const existing = (await listTracked()).find((t) => sameHackathon(candidate, t.hackathon));
    if (existing && existing.hackathonId !== id) return existing.hackathonId;
    const now = new Date().toISOString();
    await run("INSERT INTO tracked (hackathon_id, status, pinned_at) VALUES (?, 'interested', ?) ON CONFLICT DO NOTHING", id, now);
    await syncAutoDeadlines(id);
    return id;
  });
}

export async function untrackHackathon(id: string) {
  return withAccountLock("tracker", async () => {
    await run("DELETE FROM reminders_sent WHERE deadline_id IN (SELECT id FROM deadlines WHERE hackathon_id = ?)", id);
    await run("DELETE FROM deadlines WHERE hackathon_id = ?", id);
    await run("DELETE FROM tracked WHERE hackathon_id = ?", id);
  });
}

export interface TrackedPatch {
  status?: TrackStatus;
  submissionUrl?: string | null;
  result?: ResultKind | null;
  resultNotes?: string | null;
  notes?: string | null;
}

export async function updateTracked(id: string, patch: TrackedPatch) {
  return withAccountLock("tracker", async () => {
    const now = new Date().toISOString();
    const current = await get("SELECT * FROM tracked WHERE hackathon_id = ?", id);
    if (!current) throw new Error("Not tracked");
    const t = toTracked(current);
    const next = { ...t, ...patch };
    if (patch.status === "registered" && !t.registeredAt) next.registeredAt = now;
    if (patch.status === "submitted" && !t.submittedAt) next.submittedAt = now;
    await run(`UPDATE tracked SET status = ?, registered_at = ?, submitted_at = ?, submission_url = ?,
         result = ?, result_notes = ?, notes = ? WHERE hackathon_id = ?`, next.status, next.registeredAt, next.submittedAt, next.submissionUrl, next.result, next.resultNotes, next.notes, id);

    // Moving forward ticks off the deadlines you've now met, so they stop showing up and reminding you.
    const rank = (s: TrackStatus) => STATUSES.findIndex((x) => x.key === s);
    const met: DeadlineKind[] = [];
    if (rank(next.status) >= rank("registered")) met.push("registration");
    if (rank(next.status) >= rank("submitted")) met.push("submission");
    if (patch.status && met.length) {
      await run(`UPDATE deadlines SET done = 1 WHERE hackathon_id = ? AND kind IN (${met.map(() => "?").join(",")})`, id, ...met);
    }
  });
}

// ---------- deadlines ----------

/** Create or refresh the deadlines that come straight from feed data. User-edited ones are left alone. */
export async function syncAutoDeadlines(hackathonId: string) {
  return withAccountLock("tracker", async () => {
    const h = await getHackathon(hackathonId);
    if (!h) return;
    const wanted: [DeadlineKind, string | null][] = [
      ["registration", h.regEndsAt],
      ["start", h.startsAt],
      ["submission", h.endsAt],
    ];
    for (const [kind, dueAt] of wanted) {
      const existing = await get("SELECT * FROM deadlines WHERE hackathon_id = ? AND kind = ? AND auto = 1", hackathonId, kind);
      if (!dueAt) continue;
      if (existing) {
        await run("UPDATE deadlines SET due_at = ? WHERE id = ?", dueAt, existing.id as number);
      } else {
        const hasManual = await get("SELECT 1 AS one FROM deadlines WHERE hackathon_id = ? AND kind = ? AND auto = 0", hackathonId, kind);
        if (!hasManual) {
          await run("INSERT INTO deadlines (hackathon_id, kind, label, due_at, auto) VALUES (?, ?, ?, ?, 1)", hackathonId, kind, DEADLINE_LABELS[kind], dueAt);
        }
      }
    }
  });
}

export async function syncAllAutoDeadlines() {
  const ids = await all<{ hackathon_id: string }>("SELECT hackathon_id FROM tracked");
  for (const { hackathon_id } of ids) await syncAutoDeadlines(hackathon_id);
}

export async function addDeadline(hackathonId: string, kind: DeadlineKind, label: string, dueAt: string): Promise<Deadline> {
  return withAccountLock("tracker", async () => {
    const r = await get("INSERT INTO deadlines (hackathon_id, kind, label, due_at, auto) VALUES (?, ?, ?, ?, 0) RETURNING *", hackathonId, kind, label || DEADLINE_LABELS[kind], dueAt);
    return toDeadline(r!);
  });
}

export async function updateDeadline(id: number, patch: { label?: string; dueAt?: string; done?: boolean }) {
  return withAccountLock("tracker", async () => {
    const r = await get("SELECT * FROM deadlines WHERE id = ?", id);
    if (!r) throw new Error("Deadline not found");
    const d = toDeadline(r);
    const dueChanged = patch.dueAt !== undefined && patch.dueAt !== d.dueAt;
    await run("UPDATE deadlines SET label = ?, due_at = ?, done = ?, auto = ? WHERE id = ?", patch.label ?? d.label,
        patch.dueAt ?? d.dueAt,
        (patch.done ?? d.done) ? 1 : 0,
        // once the user moves a date by hand, stop overwriting it from the feed
        dueChanged ? 0 : d.auto ? 1 : 0,
        id);
  });
}

export async function deleteDeadline(id: number) {
  return withAccountLock("tracker", async () => {
    await run("DELETE FROM reminders_sent WHERE deadline_id = ?", id);
    await run("DELETE FROM deadlines WHERE id = ?", id);
  });
}

export async function listUpcomingDeadlines(): Promise<(Deadline & { hackathonTitle: string; hackathonUrl: string })[]> {
  return (await all(`SELECT d.*, h.title AS hackathon_title, h.url AS hackathon_url FROM deadlines d
       JOIN hackathons h ON h.id = d.hackathon_id
       JOIN tracked t ON t.hackathon_id = d.hackathon_id
       WHERE d.done = 0 AND t.status != 'results' ORDER BY d.due_at ASC`,))
    .map((r) => ({ ...toDeadline(r), hackathonTitle: r.hackathon_title as string, hackathonUrl: r.hackathon_url as string }));
}
