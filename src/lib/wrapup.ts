import "server-only";
import { generateJson } from "./ai";
import { db, getSetting, setSetting } from "./db";
import { factsBlock } from "./details";
import { deleteFile } from "./files";
import { listQa } from "./pitch";
import { listIdeas } from "./planning";
import { getProject, projectBlock } from "./project";
import { getHackathon, listTracked } from "./repo";
import { toUsd } from "./sources/util";
import { listStandups } from "./standups";
import type { Certificate, Prize, PrizeStatus, Profile, Project, Retro, Stats, TrackedWithHackathon } from "./types";

type Row = Record<string, string | number | null>;

/** A hackathon counts as "done" once you've submitted, or it has ended while you were registered/building. */
export function isDone(t: TrackedWithHackathon, now = Date.now()) {
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

export function listCertificates(hackathonId?: string): Certificate[] {
  const rows = db()
    .prepare(
      `SELECT c.*, h.title AS hackathon_title FROM certificates c JOIN hackathons h ON h.id = c.hackathon_id
       ${hackathonId ? "WHERE c.hackathon_id = ?" : ""} ORDER BY c.id DESC`,
    )
    .all(...(hackathonId ? [hackathonId] : [])) as Row[];
  return rows.map(toCert);
}

/** Finished hackathons you have no certificate entry for at all: shown as "probably pending". */
export function missingCertificates(): { hackathonId: string; title: string; endedAt: string | null }[] {
  const have = new Set(listCertificates().map((c) => c.hackathonId));
  return listTracked()
    .filter((t) => isDone(t) && !have.has(t.hackathonId))
    .map((t) => ({ hackathonId: t.hackathonId, title: t.hackathon.title, endedAt: t.hackathon.endsAt }));
}

export function addCertificate(
  hackathonId: string,
  c: { title: string; status: Certificate["status"]; url?: string | null; file?: string | null; mime?: string | null },
) {
  const received = c.status === "received" || Boolean(c.file || c.url);
  db()
    .prepare("INSERT INTO certificates (hackathon_id, title, status, url, file, mime, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(
      hackathonId, c.title || "Certificate of participation", received ? "received" : "pending",
      c.url || null, c.file ?? null, c.mime ?? null, received ? new Date().toISOString() : null, new Date().toISOString(),
    );
}

export function updateCertificate(id: number, patch: { title?: string; url?: string | null; file?: string | null; mime?: string | null; status?: Certificate["status"] }) {
  const r = db().prepare("SELECT * FROM certificates WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new Error("Certificate not found");
  const cur = toCert({ ...r, hackathon_title: "" });
  if (patch.file !== undefined && cur.file && patch.file !== cur.file) deleteFile(cur.file);
  const next = { ...cur, ...patch };
  if ((patch.file || patch.url) && !patch.status) next.status = "received";
  db()
    .prepare("UPDATE certificates SET title = ?, status = ?, url = ?, file = ?, mime = ?, received_at = ? WHERE id = ?")
    .run(next.title, next.status, next.url, next.file, next.mime, next.status === "received" ? (cur.receivedAt ?? new Date().toISOString()) : null, id);
}

export function deleteCertificate(id: number) {
  const r = db().prepare("SELECT file FROM certificates WHERE id = ?").get(id) as { file: string | null } | undefined;
  deleteFile(r?.file);
  db().prepare("DELETE FROM certificates WHERE id = ?").run(id);
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

export function listPrizes(hackathonId?: string): Prize[] {
  return (
    db()
      .prepare(
        `SELECT p.*, h.title AS hackathon_title FROM prizes p JOIN hackathons h ON h.id = p.hackathon_id
         ${hackathonId ? "WHERE p.hackathon_id = ?" : ""} ORDER BY p.id DESC`,
      )
      .all(...(hackathonId ? [hackathonId] : [])) as Row[]
  ).map(toPrize);
}

type PrizeInput = Partial<Omit<Prize, "id" | "hackathonId" | "hackathonTitle">>;

export function addPrize(hackathonId: string, p: PrizeInput) {
  db()
    .prepare(
      "INSERT INTO prizes (hackathon_id, title, amount, currency, kind, status, expected_by, paid_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      hackathonId, p.title || "Prize", p.amount ?? null, p.currency || "INR", p.kind || "cash", p.status || "won",
      p.expectedBy || null, p.status === "paid" ? (p.paidAt ?? new Date().toISOString()) : null, p.notes || null, new Date().toISOString(),
    );
}

export function updatePrize(id: number, patch: PrizeInput) {
  const r = db().prepare("SELECT * FROM prizes WHERE id = ?").get(id) as Row | undefined;
  if (!r) throw new Error("Prize not found");
  const cur = toPrize({ ...r, hackathon_title: "" });
  const next = { ...cur, ...patch };
  if (patch.status === "paid" && !cur.paidAt) next.paidAt = new Date().toISOString();
  if (patch.status && patch.status !== "paid") next.paidAt = null;
  db()
    .prepare("UPDATE prizes SET title = ?, amount = ?, currency = ?, kind = ?, status = ?, expected_by = ?, paid_at = ?, notes = ? WHERE id = ?")
    .run(next.title, next.amount, next.currency, next.kind, next.status, next.expectedBy, next.paidAt, next.notes, id);
}

export function deletePrize(id: number) {
  db().prepare("DELETE FROM prizes WHERE id = ?").run(id);
}

export function prizeHackathon(id: number) {
  return (db().prepare("SELECT hackathon_id FROM prizes WHERE id = ?").get(id) as { hackathon_id: string } | undefined)?.hackathon_id ?? null;
}

export function certificateHackathon(id: number) {
  return (db().prepare("SELECT hackathon_id FROM certificates WHERE id = ?").get(id) as { hackathon_id: string } | undefined)?.hackathon_id ?? null;
}

// ---------- retro notes ----------

export function getRetro(hackathonId: string): Retro {
  const r = db().prepare("SELECT * FROM retros WHERE hackathon_id = ?").get(hackathonId) as Row | undefined;
  return {
    hackathonId,
    rating: (r?.rating as number) ?? null,
    wentWell: (r?.went_well as string) ?? "",
    improve: (r?.improve as string) ?? "",
    lessons: (r?.lessons as string) ?? "",
    updatedAt: (r?.updated_at as string) ?? null,
  };
}

export function saveRetro(hackathonId: string, patch: Partial<Retro>): Retro {
  const next = { ...getRetro(hackathonId), ...patch };
  db()
    .prepare(
      `INSERT INTO retros (hackathon_id, rating, went_well, improve, lessons, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(hackathon_id) DO UPDATE SET rating = excluded.rating, went_well = excluded.went_well,
         improve = excluded.improve, lessons = excluded.lessons, updated_at = excluded.updated_at`,
    )
    .run(hackathonId, next.rating, next.wentWell, next.improve, next.lessons, new Date().toISOString());
  return getRetro(hackathonId);
}

/** Draft retro notes from what HackMate saw: standups, idea critiques, mock Q&A scores, result, prizes. */
export async function draftRetro(hackathonId: string): Promise<Pick<Retro, "wentWell" | "improve" | "lessons">> {
  const h = getHackathon(hackathonId);
  if (!h) throw new Error("Unknown hackathon");
  const standups = listStandups(hackathonId).filter((s) => s.summary).reverse();
  const ideas = listIdeas(hackathonId);
  const qa = listQa(hackathonId).filter((t) => t.grade);
  const prizes = listPrizes(hackathonId);
  const activity = [
    standups.length > 0 &&
      `Standups (oldest first):\n${standups.map((s) => `- ${s.createdAt.slice(0, 16)}: done ${s.summary!.done.join("; ") || "—"} | next ${s.summary!.next.join("; ") || "—"} | blockers ${s.summary!.blockers.join("; ") || "—"}`).join("\n")}`,
    ideas.length > 0 &&
      `Idea iterations:\n${ideas.map((i) => `- ${i.title}: scores ${i.versions.filter((v) => v.critique).map((v) => v.critique!.score).join(" → ") || "unscored"}; last weak points: ${i.versions.at(-1)?.critique?.negatives.slice(0, 3).join("; ") ?? "—"}`).join("\n")}`,
    qa.length > 0 && `Mock Q&A: average ${(qa.reduce((n, t) => n + t.grade!.score, 0) / qa.length).toFixed(1)}/10; weakest: ${qa.sort((a, b) => a.grade!.score - b.grade!.score).slice(0, 2).map((t) => t.question).join(" | ")}`,
    prizes.length > 0 && `Prizes: ${prizes.map((p) => `${p.title}${p.amount ? ` (${p.amount} ${p.currency})` : ""}`).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await generateJson<{ wentWell: string; improve: string; lessons: string }>({
    task: "retro",
    temperature: 0.5,
    system:
      'Draft a short, honest hackathon retrospective in the first person from the activity log. Reply with JSON { "wentWell": string, "improve": string, "lessons": string }, each 2-5 bullet lines starting with "- ". Base it only on the log: never claim user feedback, metrics, or events it does not mention. Where there is too little data, write a prompt for the user to fill in, e.g. "- [How did the demo go?]".',
    messages: [{ role: "user", content: `${factsBlock(h)}\n\n${projectBlock(hackathonId)}\n\n${activity || "(no activity logged)"}` }],
  });
  return res.data;
}

// ---------- profile & portfolio ----------

const EMPTY_PROFILE: Profile = { name: "", headline: "", bio: "", location: "", github: "", linkedin: "", website: "" };

export function getProfile(): Profile {
  const raw = getSetting("profile");
  return raw ? { ...EMPTY_PROFILE, ...JSON.parse(raw) } : EMPTY_PROFILE;
}

export function saveProfile(p: Partial<Profile>): Profile {
  setSetting("profile", JSON.stringify({ ...getProfile(), ...p }));
  return getProfile();
}

export interface PortfolioEntry {
  tracked: TrackedWithHackathon;
  project: Project;
  prizes: Prize[];
  certificates: Certificate[];
  retro: Retro;
}

export function portfolio(): PortfolioEntry[] {
  const prizes = listPrizes();
  const certs = listCertificates();
  return listTracked()
    .filter((t) => isDone(t))
    .sort((a, b) => (b.hackathon.endsAt ?? "").localeCompare(a.hackathon.endsAt ?? ""))
    .map((t) => ({
      tracked: t,
      project: getProject(t.hackathonId),
      prizes: prizes.filter((p) => p.hackathonId === t.hackathonId),
      certificates: certs.filter((c) => c.hackathonId === t.hackathonId),
      retro: getRetro(t.hackathonId),
    }));
}

// ---------- stats ----------

export function stats(): Stats {
  const tracked = listTracked();
  const done = tracked.filter((t) => isDone(t));
  const withResults = done.filter((t) => t.result && t.result !== "participated");
  const results: Record<string, number> = {};
  for (const t of done) results[t.result ?? "pending"] = (results[t.result ?? "pending"] ?? 0) + 1;
  const wins = done.filter((t) => t.result === "won").length;
  const podiums = done.filter((t) => t.result === "won" || t.result === "runner_up" || t.result === "special_mention").length;
  const decided = done.filter((t) => t.result).length;

  const prizes = listPrizes();
  const usd = (p: Prize) => (p.kind === "cash" && p.amount ? toUsd(p.amount, p.currency) : 0);
  const sum = (list: Prize[]) => Math.round(list.reduce((n, p) => n + usd(p), 0));

  const certs = listCertificates();

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

  const ideaScores = db().prepare("SELECT critique FROM idea_versions WHERE critique IS NOT NULL").all() as { critique: string }[];
  const qaScores = db().prepare("SELECT grade FROM qa_turns WHERE grade IS NOT NULL").all() as { grade: string }[];
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

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
    certificates: { received: certs.filter((c) => c.status === "received").length, pending: certs.filter((c) => c.status === "pending").length + missingCertificates().length },
    byMonth: months,
    byMode,
    topThemes: Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([theme, count]) => ({ theme, count })),
    avgIdeaScore: avg(ideaScores.map((r) => JSON.parse(r.critique).score)),
    avgQaScore: avg(qaScores.map((r) => JSON.parse(r.grade).score)),
    results,
  };
}
