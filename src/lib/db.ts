import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
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
`;

// Columns added after the first release; CREATE TABLE IF NOT EXISTS won't add them to an existing DB.
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  ["hackathons", "description", "TEXT"],
  ["hackathons", "team_min", "INTEGER"],
  ["hackathons", "team_max", "INTEGER"],
];

function migrate(conn: DatabaseSync) {
  for (const [table, column, type] of ADDED_COLUMNS) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

const globalForDb = globalThis as unknown as { hackmateDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.hackmateDb) {
    mkdirSync(DATA_DIR, { recursive: true });
    const conn = new DatabaseSync(path.join(DATA_DIR, "hackmate.db"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    migrate(conn);
    globalForDb.hackmateDb = conn;
  }
  return globalForDb.hackmateDb;
}

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
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
