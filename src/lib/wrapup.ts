import "server-only";
import { all, get, getSetting, run, setSetting, withAccountLock } from "./db";
import { deleteFile } from "./files";
import { listTracked } from "./repo";
import { toUsd } from "./sources/util";
import type { Certificate, Prize, PrizeStatus, Profile, Stats, TrackedWithHackathon } from "./types";

type Row = Record<string, string | number | null>;

/** A hackathon counts as "done" once you've submitted, or it has ended while you were registered/building. */
function isDone(t: TrackedWithHackathon, now = Date.now()) {
  if (t.status === "submitted" || t.status === "results") return true;
  const end = t.hackathon.endsAt ? new Date(t.hackathon.endsAt).getTime() : null;
  return t.status !== "interested" && end !== null && end < now;
}

// ---------- certificates ----------

function toCert(r: Row): Certificate {
  return {
    id: r.id as number,
    hackathonId: r.hackathon_id as string,
    hackathonTitle: r.hackathon_title as string,
    title: r.title as string,
    status: r.status as Certificate["status"],
    url: (r.url as string) ?? null,
    file: (r.file as string) ?? null,
    mime: (r.mime as string) ?? null,
    receivedAt: (r.received_at as string) ?? null,
  };
}

export async function listCertificates(hackathonId?: string): Promise<Certificate[]> {
  const rows = (await all(`SELECT c.*, h.title AS hackathon_title FROM certificates c JOIN hackathons h ON h.id = c.hackathon_id
       ${hackathonId ? "WHERE c.hackathon_id = ?" : ""} ORDER BY c.id DESC`, ...(hackathonId ? [hackathonId] : []))) as Row[];
  return rows.map(toCert);
}

/** Finished hackathons you have no certificate entry for at all: shown as "probably pending". */
export async function missingCertificates(): Promise<{ hackathonId: string; title: string; endedAt: string | null }[]> {
  const have = new Set((await listCertificates()).map((c) => c.hackathonId));
  return (await listTracked())
    .filter((t) => isDone(t) && !have.has(t.hackathonId))
    .map((t) => ({ hackathonId: t.hackathonId, title: t.hackathon.title, endedAt: t.hackathon.endsAt }));
}

export async function addCertificate(
  hackathonId: string,
  c: { title: string; status: Certificate["status"]; url?: string | null; file?: string | null; mime?: string | null },
) {
  const received = c.status === "received" || Boolean(c.file || c.url);
  (await run("INSERT INTO certificates (hackathon_id, title, status, url, file, mime, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", hackathonId, c.title || "Certificate of participation", received ? "received" : "pending",
      c.url || null, c.file ?? null, c.mime ?? null, received ? new Date().toISOString() : null, new Date().toISOString(),));
}

export async function updateCertificate(id: number, patch: { title?: string; url?: string | null; file?: string | null; mime?: string | null; status?: Certificate["status"] }) {
  return withAccountLock(`wrapup:updateCertificate:${id}`, async () => {
    const r = (await get("SELECT * FROM certificates WHERE id = ?", id)) as Row | undefined;
    if (!r) throw new Error("Certificate not found");
    const cur = toCert({ ...r, hackathon_title: "" });
    if (patch.file !== undefined && cur.file && patch.file !== cur.file) await deleteFile(cur.file);
    const next = { ...cur, ...patch };
    if ((patch.file || patch.url) && !patch.status) next.status = "received";
    (await run("UPDATE certificates SET title = ?, status = ?, url = ?, file = ?, mime = ?, received_at = ? WHERE id = ?", next.title, next.status, next.url, next.file, next.mime, next.status === "received" ? (cur.receivedAt ?? new Date().toISOString()) : null, id));
  });
}

export async function deleteCertificate(id: number) {
  const r = (await get("SELECT file FROM certificates WHERE id = ?", id)) as { file: string | null } | undefined;
  await deleteFile(r?.file);
  (await run("DELETE FROM certificates WHERE id = ?", id));
}

// ---------- prizes ----------

function toPrize(r: Row): Prize {
  return {
    id: r.id as number,
    hackathonId: r.hackathon_id as string,
    hackathonTitle: r.hackathon_title as string,
    title: r.title as string,
    amount: (r.amount as number) ?? null,
    currency: r.currency as string,
    kind: r.kind as Prize["kind"],
    status: r.status as PrizeStatus,
    expectedBy: (r.expected_by as string) ?? null,
    paidAt: (r.paid_at as string) ?? null,
    notes: (r.notes as string) ?? null,
  };
}

export async function listPrizes(hackathonId?: string): Promise<Prize[]> {
  return (
    (await all(`SELECT p.*, h.title AS hackathon_title FROM prizes p JOIN hackathons h ON h.id = p.hackathon_id
         ${hackathonId ? "WHERE p.hackathon_id = ?" : ""} ORDER BY p.id DESC`, ...(hackathonId ? [hackathonId] : []))) as Row[]
  ).map(toPrize);
}

type PrizeInput = Partial<Omit<Prize, "id" | "hackathonId" | "hackathonTitle">>;

export async function addPrize(hackathonId: string, p: PrizeInput) {
  (await run("INSERT INTO prizes (hackathon_id, title, amount, currency, kind, status, expected_by, paid_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", hackathonId, p.title || "Prize", p.amount ?? null, p.currency || "INR", p.kind || "cash", p.status || "won",
      p.expectedBy || null, p.status === "paid" ? (p.paidAt ?? new Date().toISOString()) : null, p.notes || null, new Date().toISOString(),));
}

export async function updatePrize(id: number, patch: PrizeInput) {
  return withAccountLock(`wrapup:updatePrize:${id}`, async () => {
    const r = (await get("SELECT * FROM prizes WHERE id = ?", id)) as Row | undefined;
    if (!r) throw new Error("Prize not found");
    const cur = toPrize({ ...r, hackathon_title: "" });
    const next = { ...cur, ...patch };
    if (patch.status === "paid" && !cur.paidAt) next.paidAt = new Date().toISOString();
    if (patch.status && patch.status !== "paid") next.paidAt = null;
    (await run("UPDATE prizes SET title = ?, amount = ?, currency = ?, kind = ?, status = ?, expected_by = ?, paid_at = ?, notes = ? WHERE id = ?", next.title, next.amount, next.currency, next.kind, next.status, next.expectedBy, next.paidAt, next.notes, id));
  });
}

export async function deletePrize(id: number) {
  (await run("DELETE FROM prizes WHERE id = ?", id));
}

export async function prizeHackathon(id: number) {
  return ((await get("SELECT hackathon_id FROM prizes WHERE id = ?", id)) as { hackathon_id: string } | undefined)?.hackathon_id ?? null;
}

export async function certificateHackathon(id: number) {
  return ((await get("SELECT hackathon_id FROM certificates WHERE id = ?", id)) as { hackathon_id: string } | undefined)?.hackathon_id ?? null;
}

// ---------- profile & portfolio ----------

const EMPTY_PROFILE: Profile = { name: "", headline: "", bio: "", location: "", github: "", linkedin: "", website: "" };

export async function getProfile(): Promise<Profile> {
  const raw = await getSetting("profile");
  return raw ? { ...EMPTY_PROFILE, ...JSON.parse(raw) } : EMPTY_PROFILE;
}

export async function saveProfile(p: Partial<Profile>): Promise<Profile> {
  return withAccountLock("wrapup:saveProfile", async () => {
    await setSetting("profile", JSON.stringify({ ...await getProfile(), ...p }));
    return getProfile();
  });
}

export interface PortfolioEntry {
  tracked: TrackedWithHackathon;
  prizes: Prize[];
  certificates: Certificate[];
}

export async function portfolio(): Promise<PortfolioEntry[]> {
  const prizes = await listPrizes();
  const certs = await listCertificates();
  const done = (await listTracked())
    .filter((t) => isDone(t))
    .sort((a, b) => (b.hackathon.endsAt ?? "").localeCompare(a.hackathon.endsAt ?? ""));
  return done.map((t) => ({
    tracked: t,
    prizes: prizes.filter((p) => p.hackathonId === t.hackathonId),
    certificates: certs.filter((c) => c.hackathonId === t.hackathonId),
  }));
}

// ---------- stats ----------

export async function stats(): Promise<Stats> {
  const tracked = await listTracked();
  const done = tracked.filter((t) => isDone(t));
  const withResults = done.filter((t) => t.result && t.result !== "participated");
  const results: Record<string, number> = {};
  for (const t of done) results[t.result ?? "pending"] = (results[t.result ?? "pending"] ?? 0) + 1;
  const wins = done.filter((t) => t.result === "won").length;
  const podiums = done.filter((t) => t.result === "won" || t.result === "runner_up" || t.result === "special_mention").length;
  const decided = done.filter((t) => t.result).length;

  const prizes = await listPrizes();
  const usd = (p: Prize) => (p.kind === "cash" && p.amount ? toUsd(p.amount, p.currency) : 0);
  const sum = (list: Prize[]) => Math.round(list.reduce((n, p) => n + usd(p), 0));

  const certs = await listCertificates();

  // last 12 months, by the month each finished hackathon ended
  const months: Stats["byMonth"] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = done.filter((t) => (t.hackathon.endsAt ?? t.hackathon.startsAt ?? "").startsWith(key));
    months.push({ month: key, count: inMonth.length, wins: inMonth.filter((t) => t.result === "won" || t.result === "runner_up").length });
  }

  const byMode: Record<string, number> = {};
  const themes: Record<string, number> = {};
  for (const t of done) {
    byMode[t.hackathon.mode] = (byMode[t.hackathon.mode] ?? 0) + 1;
    for (const th of t.hackathon.themes) themes[th] = (themes[th] ?? 0) + 1;
  }

  return {
    tracked: tracked.length,
    done: done.length,
    inProgress: tracked.filter((t) => !isDone(t) && t.status !== "interested").length,
    withResults: withResults.length,
    wins,
    podiums,
    winRate: decided ? Math.round((podiums / decided) * 100) : null,
    prizeUsd: {
      won: sum(prizes),
      paid: sum(prizes.filter((p) => p.status === "paid")),
      pending: sum(prizes.filter((p) => p.status !== "paid")),
    },
    prizeCount: prizes.length,
    certificates: { received: certs.filter((c) => c.status === "received").length, pending: certs.filter((c) => c.status === "pending").length + (await missingCertificates()).length },
    byMonth: months,
    byMode,
    topThemes: Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([theme, count]) => ({ theme, count })),
    results,
  };
}
