/**
 * One-time copy of a HackMate that ran on SQLite (data/hackmate.db, data/users/*.db, data/files) into Postgres.
 *
 *   DATABASE_URL=postgres://... node --conditions=react-server scripts/import-sqlite.ts
 *
 * Shared data (hackathons, AI-read rules, past winners, the AI cache, geocodes, accounts) keeps its ids. Personal
 * rows get new ids, since the signed-out data and each account's file numbered theirs separately: the
 * signed-out data becomes account 0, each data/users/<id>.db becomes account <id>. Run it once, on an empty
 * database: it refuses if accounts or tracked hackathons are already there.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { asOwner, closeDb, prepareSchema, tx } from "../src/lib/db.ts";

type Row = Record<string, unknown>;
const DATA = path.join(process.cwd(), "data");
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", mp4: "video/mp4", webm: "audio/webm", mov: "video/quicktime", ogg: "audio/ogg", m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav" };

const open = (file: string) => new DatabaseSync(file, { readOnly: true });
const rows = (db: DatabaseSync, table: string): Row[] => {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all() as Row[];
  } catch {
    return []; // table didn't exist in that version
  }
};

async function insert(table: string, row: Row, opts: { conflict?: string; returning?: boolean } = {}) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})${opts.conflict ?? ""}${opts.returning ? " RETURNING id" : ""}`;
  return asOwner.get<{ id: number }>(sql, ...cols.map((c) => row[c] ?? null));
}

async function shared(db: DatabaseSync) {
  for (const t of ["hackathons", "hackathon_details", "past_winners", "geocache", "ai_cache"]) {
    for (const r of rows(db, t)) await insert(t, r, { conflict: " ON CONFLICT DO NOTHING" });
    console.log(`  ${t}: ${rows(db, t).length}`);
  }
  for (const r of rows(db, "users")) await insert("users", r, { conflict: " ON CONFLICT DO NOTHING" });
  for (const r of rows(db, "sessions")) await insert("sessions", r, { conflict: " ON CONFLICT DO NOTHING" });
  await asOwner.run("SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1))");
  const last = rows(db, "settings").find((r) => r.key === "lastSync");
  if (last) await insert("app_settings", { key: "lastSync", value: last.value }, { conflict: " ON CONFLICT DO NOTHING" });
  console.log(`  accounts: ${rows(db, "users").length}`);
}

/** One account's (or the signed-out) personal tables, with fresh ids and references rewired. */
async function personal(db: DatabaseSync, userId: number) {
  const own = (r: Row) => ({ ...r, user_id: userId });
  const fresh = async (table: string, r: Row) => (await insert(table, own(Object.fromEntries(Object.entries(r).filter(([k]) => k !== "id"))), { returning: true }))!.id;
  for (const t of ["tracked", "projects", "retros"]) for (const r of rows(db, t)) await insert(t, own(r));
  for (const r of rows(db, "settings")) if (r.key !== "lastSync") await insert("settings", own(r));
  const deadlines = new Map<number, number>();
  for (const r of rows(db, "deadlines")) deadlines.set(r.id as number, await fresh("deadlines", r));
  for (const r of rows(db, "reminders_sent")) {
    const id = deadlines.get(r.deadline_id as number);
    if (id) await insert("reminders_sent", own({ ...r, deadline_id: id }), { conflict: " ON CONFLICT DO NOTHING" });
  }
  const ideas = new Map<number, number>();
  for (const r of rows(db, "ideas")) ideas.set(r.id as number, await fresh("ideas", r));
  for (const r of rows(db, "idea_versions")) {
    const id = ideas.get(r.idea_id as number);
    if (id) await fresh("idea_versions", { ...r, idea_id: id });
  }
  for (const t of ["email_log", "chat_messages", "teammates", "standups", "ai_outputs", "qa_turns", "checklist_items", "certificates", "prizes"]) {
    for (const r of rows(db, t)) await fresh(t, r);
  }
  console.log(`  account ${userId}: ${rows(db, "tracked").length} tracked, ${rows(db, "deadlines").length} deadlines, ${rows(db, "ideas").length} ideas`);
}

async function files() {
  let n = 0;
  for (const dir of ["files", "audio"]) {
    const where = path.join(DATA, dir);
    if (!existsSync(where)) continue;
    for (const name of readdirSync(where)) {
      if (!/^[\w-]+\.\w+$/.test(name)) continue;
      const mime = MIME[name.split(".").pop()!] ?? "application/octet-stream";
      await insert("files", { name, mime, data: readFileSync(path.join(where, name)), created_at: new Date().toISOString() }, { conflict: " ON CONFLICT DO NOTHING" });
      n++;
    }
  }
  console.log(`  files: ${n}`);
}

async function main() {
  const main = path.join(DATA, "hackmate.db");
  if (!existsSync(main)) throw new Error(`No ${main} to import`);
  await prepareSchema();
  const already = await asOwner.get<{ n: number }>("SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM tracked) AS n");
  if (already && already.n > 0) throw new Error("This database already has accounts or tracked hackathons; not importing over them.");
  await tx(
    async () => {
      const db = open(main);
      console.log("shared data");
      await shared(db);
      console.log("personal data");
      await personal(db, 0);
      const users = path.join(DATA, "users");
      if (existsSync(users)) {
        for (const f of readdirSync(users)) {
          const id = f.match(/^(\d+)\.db$/)?.[1];
          if (id) await personal(open(path.join(users, f)), Number(id));
        }
      }
      await files();
    },
    { owner: true },
  );
  console.log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
