import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { copySignedOutData, runAs, sharedDb } from "./db";
import type { Account, Member, MemberProfile } from "./types";
import { getProfile } from "./wrapup";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "hm_session";
const SESSION_DAYS = 30;

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const EMPTY: MemberProfile = { name: "", headline: "", bio: "", location: "", github: "", linkedin: "", website: "", skills: [], lookingForTeam: false };

interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  profile: string;
  created_at: string;
}

const toMember = (r: UserRow): Member => ({ username: r.username, joinedAt: r.created_at, profile: { ...EMPTY, ...JSON.parse(r.profile) } });
const toAccount = (r: UserRow): Account => ({ ...toMember(r), email: r.email });

// ---------- passwords ----------

/** scrypt with a random salt per password, stored as "scrypt$salt$hash". */
async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function checkPassword(pw: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scryptAsync(pw, Buffer.from(salt, "base64url"), want.length);
  return timingSafeEqual(want, got);
}

// A hash to compare against when the email isn't registered, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(12).toString("hex"));

// ---------- sign-in attempts ----------

/** At most 10 wrong passwords per email in 15 minutes. Kept in memory: a restart clears it. */
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

function recentFailures(key: string) {
  const list = (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(key, list);
  return list;
}

// ---------- validation ----------

const USERNAME = /^[a-z0-9][a-z0-9_-]{2,23}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkSignup(username: string, email: string, password: string) {
  if (!USERNAME.test(username)) throw new AuthError("Usernames are 3 to 24 letters, numbers, - or _, starting with a letter or number.");
  if (!EMAIL.test(email) || email.length > 200) throw new AuthError("That email doesn't look right.");
  if (password.length < 8) throw new AuthError("Use at least 8 characters for your password.");
  if (password.length > 200) throw new AuthError("That password is too long.");
}

// ---------- sessions ----------

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

async function startSession(userId: number, secure: boolean) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  sharedDb().prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenHash(token), userId, now.toISOString(), expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
}

/** The signed-in person, or null. Expired sessions are cleared as they're found. */
export async function currentUser(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = sharedDb()
    .prepare("SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?")
    .get(tokenHash(token)) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    sharedDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
    return null;
  }
  return toAccount(row);
}

export async function currentUserId(): Promise<number | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = sharedDb().prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?").get(tokenHash(token), new Date().toISOString()) as
    | { user_id: number }
    | undefined;
  return row?.user_id ?? null;
}

// ---------- actions ----------

export async function signUp(input: { username: string; email: string; password: string }, secure: boolean): Promise<Account> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  checkSignup(username, email, input.password);
  if (sharedDb().prepare("SELECT 1 FROM users WHERE username = ?").get(username)) throw new AuthError("That username is taken.", 409);
  if (sharedDb().prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new AuthError("There's already an account with that email. Sign in instead.", 409);

  // The first account on this HackMate starts from the profile already filled in here.
  const first = !sharedDb().prepare("SELECT 1 FROM users LIMIT 1").get();
  const profile: MemberProfile = first ? { ...EMPTY, ...getProfile() } : { ...EMPTY, name: username };
  const res = sharedDb()
    .prepare("INSERT INTO users (username, email, password_hash, profile, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(username, email, await hashPassword(input.password), JSON.stringify(profile), new Date().toISOString());
  // The first account also takes over the tracker, ideas and results built here before accounts existed.
  if (first) copySignedOutData(Number(res.lastInsertRowid));
  await startSession(Number(res.lastInsertRowid), secure);
  return toAccount(sharedDb().prepare("SELECT * FROM users WHERE id = ?").get(res.lastInsertRowid) as unknown as UserRow);
}

export async function signIn(input: { email: string; password: string }, secure: boolean): Promise<Account> {
  const email = input.email.trim().toLowerCase();
  if (recentFailures(email).length >= MAX_FAILURES) throw new AuthError("Too many wrong passwords. Wait 15 minutes and try again.", 429);
  const row = sharedDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  const ok = row ? await checkPassword(input.password, row.password_hash) : (await checkPassword(input.password, await DUMMY_HASH), false);
  if (!row || !ok) {
    recentFailures(email).push(Date.now());
    throw new AuthError("Wrong email or password.", 401);
  }
  failures.delete(email);
  await startSession(row.id, secure);
  return toAccount(row);
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) sharedDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  jar.delete(SESSION_COOKIE);
}

/** Save the signed-in person's public profile. */
export async function saveMemberProfile(patch: Partial<MemberProfile>): Promise<Account> {
  const id = await currentUserId();
  if (id == null) throw new AuthError("Sign in to edit your profile.", 401);
  const row = sharedDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as UserRow;
  const next = { ...EMPTY, ...JSON.parse(row.profile), ...patch };
  sharedDb().prepare("UPDATE users SET profile = ? WHERE id = ?").run(JSON.stringify(next), id);
  return toAccount({ ...row, profile: JSON.stringify(next) });
}

// ---------- the directory ----------

/** Everyone who has signed up, newest first. */
export function listMembers(): Member[] {
  return (sharedDb().prepare("SELECT * FROM users ORDER BY created_at DESC").all() as unknown as UserRow[]).map(toMember);
}

export function getMember(username: string): Member | null {
  const row = sharedDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  return row ? toMember(row) : null;
}

/**
 * Wrap a route handler so everything it does reads and writes the signed-in person's own data
 * (or the signed-out data when no one is signed in).
 */
export function withAccount<A extends unknown[], R>(handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => runAs(await currentUserId(), () => handler(...args));
}
