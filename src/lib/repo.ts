import "server-only";
import { aiPolicy } from "./aiPolicy";
import { deduplicateHackathons, sameHackathon } from "./deduplicate";
import { db } from "./db";
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

export function upsertHackathons(list: Hackathon[], seenAt: string) {
  const stmt = db().prepare(`
    INSERT INTO hackathons (id, source, title, tagline, url, image, mode, city, state, country, venue, lat, lng,
      starts_at, ends_at, reg_starts_at, reg_ends_at, prize_text, prize_usd, entry_fee, themes, organizer, last_seen_at,
      description, team_min, team_max)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, tagline = excluded.tagline, url = excluded.url, image = excluded.image,
      mode = excluded.mode, city = excluded.city, state = excluded.state, country = excluded.country,
      venue = excluded.venue,
      -- keep coordinates we geocoded earlier unless the feed now gives exact ones
      lat = COALESCE(excluded.lat, CASE WHEN hackathons.city IS excluded.city THEN hackathons.lat END),
      lng = COALESCE(excluded.lng, CASE WHEN hackathons.city IS excluded.city THEN hackathons.lng END),
      starts_at = excluded.starts_at, ends_at = excluded.ends_at,
      reg_starts_at = excluded.reg_starts_at, reg_ends_at = excluded.reg_ends_at,
      prize_text = excluded.prize_text, prize_usd = excluded.prize_usd, entry_fee = excluded.entry_fee,
      themes = excluded.themes, organizer = excluded.organizer, last_seen_at = excluded.last_seen_at,
      description = excluded.description, team_min = excluded.team_min, team_max = excluded.team_max
  `);
  db().exec("BEGIN");
  try {
    for (const h of list) {
      stmt.run(
        h.id, h.source, h.title, h.tagline, h.url, h.image, h.mode, h.city, h.state, h.country, h.venue,
        h.lat, h.lng, h.startsAt, h.endsAt, h.regStartsAt, h.regEndsAt, h.prizeText, h.prizeUsd,
        h.entryFee, JSON.stringify(h.themes), h.organizer, seenAt,
        h.description ?? null, h.teamMin, h.teamMax,
      );
    }
    db().exec("COMMIT");
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
}

/** Hackathons that haven't ended yet (or have no end date), plus anything being tracked. */
export function listHackathons(): Hackathon[] {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const list = (
    db()
      .prepare(
        // The full rules (when the AI has read them) win over the feed description for the AI policy.
        `SELECT h.*, COALESCE(d.source_text, h.description) AS policy_text FROM hackathons h
         LEFT JOIN hackathon_details d ON d.hackathon_id = h.id
         WHERE h.ends_at IS NULL OR h.ends_at >= ? OR h.id IN (SELECT hackathon_id FROM tracked)
         ORDER BY COALESCE(h.starts_at, h.ends_at) ASC`,
      )
      .all(cutoff) as Record<string, unknown>[]
  ).map((r) => ({ ...toHackathon(r), aiPolicy: aiPolicy(r.policy_text as string | null) }));
  const trackedIds = new Set((db().prepare("SELECT hackathon_id FROM tracked").all() as { hackathon_id: string }[]).map((r) => r.hackathon_id));
  return deduplicateHackathons(list, trackedIds);
}

export function getDescription(id: string): string | null {
  const r = db().prepare("SELECT description FROM hackathons WHERE id = ?").get(id) as { description: string | null } | undefined;
  return r?.description ?? null;
}

export function getHackathon(id: string): Hackathon | null {
  const r = db().prepare("SELECT * FROM hackathons WHERE id = ?").get(id);
  return r ? toHackathon(r) : null;
}

export function hackathonsNeedingGeocode(): { id: string; city: string; state: string | null; country: string | null }[] {
  return db()
    .prepare(
      `SELECT id, city, state, country FROM hackathons
       WHERE mode != 'online' AND city IS NOT NULL AND city != '' AND lat IS NULL`,
    )
    .all() as { id: string; city: string; state: string | null; country: string | null }[];
}

export function setCoords(id: string, lat: number, lng: number) {
  db().prepare("UPDATE hackathons SET lat = ?, lng = ? WHERE id = ?").run(lat, lng, id);
}

// ---------- tracker ----------

export function listTracked(): TrackedWithHackathon[] {
  const rows = db()
    .prepare(
      `SELECT t.*, h.* FROM tracked t JOIN hackathons h ON h.id = t.hackathon_id
       ORDER BY COALESCE(h.starts_at, h.ends_at) ASC`,
    )
    .all();
  const deadlines = db().prepare("SELECT * FROM deadlines ORDER BY due_at ASC").all().map(toDeadline);
  return rows.map((r) => ({
    ...toTracked(r),
    hackathon: toHackathon(r),
    deadlines: deadlines.filter((d) => d.hackathonId === r.hackathon_id),
  }));
}

export function trackHackathon(id: string) {
  const candidate = getHackathon(id);
  if (!candidate) throw new Error("Unknown hackathon");
  const existing = listTracked().find((t) => sameHackathon(candidate, t.hackathon));
  if (existing && existing.hackathonId !== id) return;
  const now = new Date().toISOString();
  db()
    .prepare("INSERT INTO tracked (hackathon_id, status, pinned_at) VALUES (?, 'interested', ?) ON CONFLICT DO NOTHING")
    .run(id, now);
  syncAutoDeadlines(id);
}

export function untrackHackathon(id: string) {
  const d = db();
  d.prepare("DELETE FROM reminders_sent WHERE deadline_id IN (SELECT id FROM deadlines WHERE hackathon_id = ?)").run(id);
  d.prepare("DELETE FROM deadlines WHERE hackathon_id = ?").run(id);
  d.prepare("DELETE FROM tracked WHERE hackathon_id = ?").run(id);
}

export interface TrackedPatch {
  status?: TrackStatus;
  submissionUrl?: string | null;
  result?: ResultKind | null;
  resultNotes?: string | null;
  notes?: string | null;
}

export function updateTracked(id: string, patch: TrackedPatch) {
  const now = new Date().toISOString();
  const current = db().prepare("SELECT * FROM tracked WHERE hackathon_id = ?").get(id);
  if (!current) throw new Error("Not tracked");
  const t = toTracked(current);
  const next = { ...t, ...patch };
  if (patch.status === "registered" && !t.registeredAt) next.registeredAt = now;
  if (patch.status === "submitted" && !t.submittedAt) next.submittedAt = now;
  db()
    .prepare(
      `UPDATE tracked SET status = ?, registered_at = ?, submitted_at = ?, submission_url = ?,
       result = ?, result_notes = ?, notes = ? WHERE hackathon_id = ?`,
    )
    .run(next.status, next.registeredAt, next.submittedAt, next.submissionUrl, next.result, next.resultNotes, next.notes, id);

  // Moving forward ticks off the deadlines you've now met, so they stop showing up and reminding you.
  const rank = (s: TrackStatus) => STATUSES.findIndex((x) => x.key === s);
  const met: DeadlineKind[] = [];
  if (rank(next.status) >= rank("registered")) met.push("registration");
  if (rank(next.status) >= rank("submitted")) met.push("submission");
  if (patch.status && met.length) {
    db()
      .prepare(`UPDATE deadlines SET done = 1 WHERE hackathon_id = ? AND kind IN (${met.map(() => "?").join(",")})`)
      .run(id, ...met);
  }
}

// ---------- deadlines ----------

/** Create or refresh the deadlines that come straight from feed data. User-edited ones are left alone. */
export function syncAutoDeadlines(hackathonId: string) {
  const h = getHackathon(hackathonId);
  if (!h) return;
  const wanted: [DeadlineKind, string | null][] = [
    ["registration", h.regEndsAt],
    ["start", h.startsAt],
    ["submission", h.endsAt],
  ];
  const d = db();
  for (const [kind, dueAt] of wanted) {
    const existing = d
      .prepare("SELECT * FROM deadlines WHERE hackathon_id = ? AND kind = ? AND auto = 1")
      .get(hackathonId, kind);
    if (!dueAt) continue;
    if (existing) {
      d.prepare("UPDATE deadlines SET due_at = ? WHERE id = ?").run(dueAt, existing.id as number);
    } else {
      const hasManual = d
        .prepare("SELECT 1 FROM deadlines WHERE hackathon_id = ? AND kind = ? AND auto = 0")
        .get(hackathonId, kind);
      if (!hasManual) {
        d.prepare("INSERT INTO deadlines (hackathon_id, kind, label, due_at, auto) VALUES (?, ?, ?, ?, 1)").run(
          hackathonId, kind, DEADLINE_LABELS[kind], dueAt,
        );
      }
    }
  }
}

export function syncAllAutoDeadlines() {
  const ids = db().prepare("SELECT hackathon_id FROM tracked").all() as { hackathon_id: string }[];
  for (const { hackathon_id } of ids) syncAutoDeadlines(hackathon_id);
}

export function addDeadline(hackathonId: string, kind: DeadlineKind, label: string, dueAt: string): Deadline {
  const r = db()
    .prepare("INSERT INTO deadlines (hackathon_id, kind, label, due_at, auto) VALUES (?, ?, ?, ?, 0) RETURNING *")
    .get(hackathonId, kind, label || DEADLINE_LABELS[kind], dueAt);
  return toDeadline(r!);
}

export function updateDeadline(id: number, patch: { label?: string; dueAt?: string; done?: boolean }) {
  const r = db().prepare("SELECT * FROM deadlines WHERE id = ?").get(id);
  if (!r) throw new Error("Deadline not found");
  const d = toDeadline(r);
  const dueChanged = patch.dueAt !== undefined && patch.dueAt !== d.dueAt;
  db()
    .prepare("UPDATE deadlines SET label = ?, due_at = ?, done = ?, auto = ? WHERE id = ?")
    .run(
      patch.label ?? d.label,
      patch.dueAt ?? d.dueAt,
      (patch.done ?? d.done) ? 1 : 0,
      // once the user moves a date by hand, stop overwriting it from the feed
      dueChanged ? 0 : d.auto ? 1 : 0,
      id,
    );
}

export function deleteDeadline(id: number) {
  db().prepare("DELETE FROM reminders_sent WHERE deadline_id = ?").run(id);
  db().prepare("DELETE FROM deadlines WHERE id = ?").run(id);
}

export function listUpcomingDeadlines(): (Deadline & { hackathonTitle: string; hackathonUrl: string })[] {
  return db()
    .prepare(
      `SELECT d.*, h.title AS hackathon_title, h.url AS hackathon_url FROM deadlines d
       JOIN hackathons h ON h.id = d.hackathon_id
       JOIN tracked t ON t.hackathon_id = d.hackathon_id
       WHERE d.done = 0 AND t.status != 'results' ORDER BY d.due_at ASC`,
    )
    .all()
    .map((r) => ({ ...toDeadline(r), hackathonTitle: r.hackathon_title as string, hackathonUrl: r.hackathon_url as string }));
}
