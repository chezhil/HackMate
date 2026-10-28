import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const DATA_DIR = path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS hackathons (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT,
  url TEXT NOT NULL,
  image TEXT,
  mode TEXT NOT NULL,
  city TEXT,
  state TEXT,
  country TEXT,
  venue TEXT,
  lat REAL,
  lng REAL,
  starts_at TEXT,
  ends_at TEXT,
  reg_starts_at TEXT,
  reg_ends_at TEXT,
  prize_text TEXT,
  prize_usd REAL,
  entry_fee TEXT,
  themes TEXT NOT NULL DEFAULT '[]',
  organizer TEXT,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hackathons_ends ON hackathons(ends_at);

CREATE TABLE IF NOT EXISTS tracked (
  hackathon_id TEXT PRIMARY KEY REFERENCES hackathons(id),
  status TEXT NOT NULL DEFAULT 'interested',
  pinned_at TEXT NOT NULL,
  registered_at TEXT,
  submitted_at TEXT,
  submission_url TEXT,
  result TEXT,
  result_notes TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  due_at TEXT NOT NULL,
  auto INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS deadlines_hackathon ON deadlines(hackathon_id);

CREATE TABLE IF NOT EXISTS reminders_sent (
  deadline_id INTEGER NOT NULL,
  lead_minutes INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (deadline_id, lead_minutes, due_at)
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivered INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS geocache (
  query TEXT PRIMARY KEY,
  lat REAL,
  lng REAL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Accounts, so people can sign up and show a profile to everyone on this HackMate.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Only a hash of each session token is stored, so a copy of the database can't be used to sign in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- AI answers shared by everyone, so the same request (same page, same screenshot, same first question about a
-- hackathon) is paid for once. Keyed by a hash of the request; see cached() in ai.ts.
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0
);

-- AI-extracted rules, judges, deliverables etc. One row per hackathon, rebuilt on demand.
CREATE TABLE IF NOT EXISTS hackathon_details (
  hackathon_id TEXT PRIMARY KEY REFERENCES hackathons(id),
  source_text TEXT NOT NULL,
  info TEXT,
  provider TEXT,
  error TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  provider TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS past_winners (
  hackathon_id TEXT PRIMARY KEY REFERENCES hackathons(id),
  projects TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idea_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  critique TEXT,
  provider TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teammates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  name TEXT NOT NULL,
  role TEXT,
  skills TEXT,
  contact TEXT,
  confirmed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS standups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  author TEXT,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  duration_sec REAL,
  transcript TEXT,
  summary TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);

-- What you're building for a hackathon (feeds the pitch, video script, checks and write-ups).
CREATE TABLE IF NOT EXISTS projects (
  hackathon_id TEXT PRIMARY KEY REFERENCES hackathons(id),
  name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  problem TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  stack TEXT NOT NULL DEFAULT '',
  repo_url TEXT NOT NULL DEFAULT '',
  demo_url TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Generated pitches, video scripts, deck roasts and social write-ups (history per hackathon).
CREATE TABLE IF NOT EXISTS ai_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  kind TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  content TEXT NOT NULL,
  provider TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qa_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  session INTEGER NOT NULL,
  judge TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  grade TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  label TEXT NOT NULL,
  detail TEXT,
  kind TEXT NOT NULL DEFAULT 'check',
  required INTEGER NOT NULL DEFAULT 1,
  done INTEGER NOT NULL DEFAULT 0,
  value TEXT,
  file TEXT,
  mime TEXT,
  meta TEXT,
  origin TEXT NOT NULL DEFAULT 'custom',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  url TEXT,
  file TEXT,
  mime TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
  title TEXT NOT NULL,
  amount REAL,
  currency TEXT NOT NULL DEFAULT 'INR',
  kind TEXT NOT NULL DEFAULT 'cash',
  status TEXT NOT NULL DEFAULT 'won',
  expected_by TEXT,
  paid_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retros (
  hackathon_id TEXT PRIMARY KEY REFERENCES hackathons(id),
  rating INTEGER,
  went_well TEXT NOT NULL DEFAULT '',
  improve TEXT NOT NULL DEFAULT '',
  lessons TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
`;

// Columns added after the first release; CREATE TABLE IF NOT EXISTS won't add them to an existing DB.
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  ["hackathons", "description", "TEXT"],
  ["hackathons", "team_min", "INTEGER"],
  ["hackathons", "team_max", "INTEGER"],
  ["chat_messages", "citations", "TEXT"],
  ["chat_messages", "not_found", "INTEGER NOT NULL DEFAULT 0"],
  ["chat_messages", "follow_ups", "TEXT"],
];
// Bump when SCHEMA gains a table, so a running dev server creates it.
const SCHEMA_VERSION = 3;

function migrate(conn: DatabaseSync) {
  // New tables too: the connection outlives dev hot reloads, so SCHEMA alone wouldn't reach it.
  conn.exec(SCHEMA);
  for (const [table, column, type] of ADDED_COLUMNS) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// ---------- whose data ----------
//
// Hackathon listings, AI-read rules, accounts and the geocode cache are shared. Everything personal (tracker,
// deadlines, ideas, team, standups, project, pitch history, checklist, prizes, certificates, retros, chat and
// settings) lives in one database file per account, data/users/<id>.db. Signed out, you use the original file's
// personal tables, so nothing that was here before accounts is lost.
//
// A personal file attaches the shared one as "shared". SQLite looks a bare table name up in the personal file
// first, then the attached one, so the same queries work in both, and a JOIN of tracked with hackathons crosses files.

/** Tables that belong to whoever is using HackMate. The rest of SCHEMA is shared. */
export const PERSONAL_TABLES = [
  "tracked", "deadlines", "reminders_sent", "email_log", "settings", "chat_messages", "ideas", "idea_versions",
  "teammates", "standups", "projects", "ai_outputs", "qa_turns", "checklist_items", "certificates", "prizes", "retros",
];

/** The personal tables' part of SCHEMA. Foreign keys can't point into another file, so references to hackathons go. */
const PERSONAL_SCHEMA = SCHEMA.split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .filter((stmt) => {
    const table = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? stmt.match(/CREATE INDEX IF NOT EXISTS \w+ ON (\w+)/)?.[1];
    return table && PERSONAL_TABLES.includes(table);
  })
  .map((stmt) => stmt.replace(/\s+REFERENCES hackathons\(id\)/g, ""))
  .join(";\n") + ";";

/**
 * A signed-out visitor on a public HackMate: they see empty personal data in a throwaway in-memory database,
 * never the original file's. (They can't write anything either; withAccount turns those requests away.)
 */
export const ANONYMOUS = -1;

/** null = signed out (the original file). Set per request by withAccount() in auth.ts. */
const scope = new AsyncLocalStorage<number | null>();

/** Run fn as this account (or signed out, for null); every db() call inside uses that account's data. */
export function runAs<T>(userId: number | null, fn: () => T): T {
  return scope.run(userId, fn);
}

export const currentScope = (): number | null => scope.getStore() ?? null;

const globalForDb = globalThis as unknown as { hackmateDb?: DatabaseSync; hackmateMigrated?: number; hackmateUserDbs?: Map<number, DatabaseSync>; hackmateAnonDb?: DatabaseSync };
const SHARED_FILE = () => path.join(DATA_DIR, "hackmate.db");
const USERS_DIR = path.join(DATA_DIR, "users");

/** The original file: shared tables, plus the signed-out personal data. */
export function sharedDb(): DatabaseSync {
  if (!globalForDb.hackmateDb) {
    mkdirSync(DATA_DIR, { recursive: true });
    const conn = new DatabaseSync(SHARED_FILE());
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    conn.exec(SCHEMA);
    globalForDb.hackmateDb = conn;
  }
  // The connection survives dev hot reloads, so re-run the column migration whenever the list grows.
  if (globalForDb.hackmateMigrated !== ADDED_COLUMNS.length + SCHEMA_VERSION * 1000) {
    migrate(globalForDb.hackmateDb);
    globalForDb.hackmateUserDbs?.forEach(migratePersonal);
    globalForDb.hackmateMigrated = ADDED_COLUMNS.length + SCHEMA_VERSION * 1000;
  }
  return globalForDb.hackmateDb;
}

function migratePersonal(conn: DatabaseSync) {
  conn.exec(PERSONAL_SCHEMA);
  for (const [table, column, type] of ADDED_COLUMNS) {
    if (!PERSONAL_TABLES.includes(table)) continue;
    const cols = conn.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE main.${table} ADD COLUMN ${column} ${type}`);
  }
}

function userDb(userId: number): DatabaseSync {
  sharedDb(); // shared file exists and is migrated before anything attaches it
  const dbs = (globalForDb.hackmateUserDbs ??= new Map());
  let conn = dbs.get(userId);
  if (!conn) {
    mkdirSync(USERS_DIR, { recursive: true });
    conn = new DatabaseSync(path.join(USERS_DIR, `${userId}.db`));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    conn.prepare("ATTACH DATABASE ? AS shared").run(SHARED_FILE());
    migratePersonal(conn);
    dbs.set(userId, conn);
  }
  return conn;
}

function anonymousDb(): DatabaseSync {
  sharedDb();
  if (!globalForDb.hackmateAnonDb) {
    const conn = new DatabaseSync(":memory:");
    conn.prepare("ATTACH DATABASE ? AS shared").run(SHARED_FILE());
    migratePersonal(conn);
    globalForDb.hackmateAnonDb = conn;
  }
  return globalForDb.hackmateAnonDb;
}

/** The connection for whoever this request is for. */
export function db(): DatabaseSync {
  const id = currentScope();
  return id == null ? sharedDb() : id === ANONYMOUS ? anonymousDb() : userDb(id);
}

/** Every account with data, plus signed out: for background jobs (reminders, refreshing deadlines after a sync). */
export function allScopes(): (number | null)[] {
  let files: string[] = [];
  try {
    files = readdirSync(USERS_DIR);
  } catch {
    // No accounts yet.
  }
  return [null, ...files.map((f) => f.match(/^(\d+)\.db$/)?.[1]).filter(Boolean).map(Number)];
}

/** Give a new account a copy of the signed-out data, so the first person to sign up keeps what they'd built. */
export function copySignedOutData(userId: number) {
  const conn = userDb(userId);
  conn.exec("BEGIN");
  try {
    for (const t of PERSONAL_TABLES) {
      const mine = new Set((conn.prepare(`PRAGMA main.table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
      const cols = (conn.prepare(`PRAGMA shared.table_info(${t})`).all() as { name: string }[]).map((c) => c.name).filter((c) => mine.has(c));
      const list = cols.join(", ");
      // Feed state isn't personal, and the calendar link must stay unique to whoever owns it.
      const skip = [...GLOBAL_SETTINGS, "calendarToken"];
      const where = t === "settings" ? ` WHERE key NOT IN (${skip.map(() => "?").join(", ")})` : "";
      conn.prepare(`INSERT OR IGNORE INTO main.${t} (${list}) SELECT ${list} FROM shared.${t}${where}`).run(...(t === "settings" ? skip : []));
    }
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

/** Settings about the app itself rather than a person: kept in the shared file. */
const GLOBAL_SETTINGS = ["lastSync"];
const settingsDb = (key: string) => (GLOBAL_SETTINGS.includes(key) ? sharedDb() : db());

export function getSetting(key: string): string | null {
  const row = settingsDb(key).prepare("SELECT value FROM main.settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  settingsDb(key)
    .prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

/** Secret token that guards the calendar subscription feed. Created on first use. */
export function calendarToken(): string {
  let token = getSetting("calendarToken");
  if (!token) {
    token = randomBytes(18).toString("base64url");
    setSetting("calendarToken", token);
  }
  return token;
}
