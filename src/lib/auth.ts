import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { ANONYMOUS, all, giveSignedOutDataTo, get, run, runAs } from "./db";
import { clearUses, ipOf, loginRequired, record, used, withClient } from "./request";
import type { Account, Member, MemberCertificate, MemberHackathon, MemberProfile } from "./types";
import { getProfile, listCertificates, portfolio } from "./wrapup";

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

/** At most 10 wrong passwords per email in 15 minutes. */
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const failKey = (email: string) => `signin-fail:${email}`;

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
  (await run("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", tokenHash(token), userId, now.toISOString(), expires.toISOString()));
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
}

/** The signed-in person, or null. Expired sessions are cleared as they're found. */
export async function currentUser(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = (await get("SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?", tokenHash(token))) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    (await run("DELETE FROM sessions WHERE token_hash = ?", tokenHash(token)));
    return null;
  }
  return toAccount(row);
}

export async function currentUserId(): Promise<number | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    // Called outside a request (tests, scripts): no one is signed in.
    return null;
  }
  if (!token) return null;
  const row = (await get("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?", tokenHash(token), new Date().toISOString())) as
    | { user_id: number }
    | undefined;
  return row?.user_id ?? null;
}

// ---------- actions ----------

export async function signUp(input: { username: string; email: string; password: string }, secure: boolean): Promise<Account> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  checkSignup(username, email, input.password);
  if (await get("SELECT 1 AS one FROM users WHERE lower(username) = lower(?)", username)) throw new AuthError("That username is taken.", 409);
  if (await get("SELECT 1 AS one FROM users WHERE lower(email) = lower(?)", email)) throw new AuthError("There's already an account with that email. Sign in instead.", 409);

  // The first account on this HackMate starts from the profile already filled in here.
  const first = !(await get("SELECT 1 AS one FROM users LIMIT 1"));
  const profile: MemberProfile = first ? { ...EMPTY, ...await getProfile() } : { ...EMPTY, name: username };
  const created = (await get<UserRow>(
    "INSERT INTO users (username, email, password_hash, profile, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
    username, email, await hashPassword(input.password), JSON.stringify(profile), new Date().toISOString(),
  ))!;
  // The first account also takes over the tracker, ideas and results built here before accounts existed.
  if (first) await giveSignedOutDataTo(created.id);
  await startSession(created.id, secure);
  return toAccount(created);
}

export async function signIn(input: { email: string; password: string }, secure: boolean): Promise<Account> {
  const email = input.email.trim().toLowerCase();
  if ((await used(failKey(email), WINDOW_MS)) >= MAX_FAILURES) throw new AuthError("Too many wrong passwords. Wait 15 minutes and try again.", 429);
  const row = (await get("SELECT * FROM users WHERE email = ?", email)) as UserRow | undefined;
  const ok = row ? await checkPassword(input.password, row.password_hash) : (await checkPassword(input.password, await DUMMY_HASH), false);
  if (!row || !ok) {
    await record([failKey(email)]);
    throw new AuthError("Wrong email or password.", 401);
  }
  await clearUses(failKey(email));
  await startSession(row.id, secure);
  return toAccount(row);
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) (await run("DELETE FROM sessions WHERE token_hash = ?", tokenHash(token)));
  jar.delete(SESSION_COOKIE);
}

/** Save the signed-in person's public profile. */
export async function saveMemberProfile(patch: Partial<MemberProfile>): Promise<Account> {
  const id = await currentUserId();
  if (id == null) throw new AuthError("Sign in to edit your profile.", 401);
  const row = (await get("SELECT * FROM users WHERE id = ?", id)) as unknown as UserRow;
  const next = { ...EMPTY, ...JSON.parse(row.profile), ...patch };
  (await run("UPDATE users SET profile = ? WHERE id = ?", JSON.stringify(next), id));
  return toAccount({ ...row, profile: JSON.stringify(next) });
}

// ---------- the directory ----------

/** Everyone who has signed up, newest first. */
export async function listMembers(): Promise<Member[]> {
  return ((await all("SELECT * FROM users ORDER BY created_at DESC")) as unknown as UserRow[]).map(toMember);
}

export async function getMember(username: string): Promise<Member | null> {
  const row = (await get("SELECT * FROM users WHERE lower(username) = lower(?)", username)) as UserRow | undefined;
  return row ? toMember(row) : null;
}

/**
 * Wrap a route handler so everything it does reads and writes the signed-in person's own data
 * (or the signed-out data when no one is signed in).
 *
 * On a public HackMate (HACKMATE_REQUIRE_LOGIN), a signed-out visitor's reads see empty personal data, and
 * anything that changes data or calls the AI is refused until they sign in. `open` lets a write through
 * anyway (signing in and up).
 */
export function withAccount<A extends unknown[], R>(handler: (...args: A) => Promise<R>, opts: { open?: boolean } = {}): (...args: A) => Promise<R | Response> {
  return async (...args: A) => {
    const req = args[0] as Request | undefined;
    const ip = ipOf(req);
    const userId = await currentUserId();
    if (userId == null && loginRequired()) {
      if (req?.method && req.method !== "GET" && !opts.open) {
        return Response.json({ error: "Sign in to save your own tracker, ideas and results.", signIn: true }, { status: 401 });
      }
      return withClient(ip, () => runAs(ANONYMOUS, () => handler(...args)));
    }
    return withClient(ip, () => runAs(userId, () => handler(...args)));
  };
}

/**
 * What someone's done, read from their own data: finished hackathons (with the project's name and links) and
 * the certificates they've received.
 */
export async function memberActivity(username: string): Promise<{ hackathons: MemberHackathon[]; certificates: MemberCertificate[] } | null> {
  const row = (await get("SELECT id FROM users WHERE lower(username) = lower(?)", username)) as { id: number } | undefined;
  if (!row) return null;
  return runAs(row.id, async () => {
    const link = (u: string) => (/^https?:\/\//i.test(u) ? u : "");
    const hackathons = (await portfolio()).map(({ tracked: t, project: p }): MemberHackathon => ({
      id: t.hackathonId,
      title: t.hackathon.title,
      url: t.hackathon.url,
      image: t.hackathon.image,
      mode: t.hackathon.mode,
      startsAt: t.hackathon.startsAt,
      endsAt: t.hackathon.endsAt,
      result: t.result,
      project: p.name.trim() ? { name: p.name, tagline: p.tagline, repoUrl: link(p.repoUrl), demoUrl: link(p.demoUrl) } : null,
    }));
    const certificates = (await listCertificates())
      .filter((c) => c.status === "received")
      .map(({ id, hackathonId, hackathonTitle, title, url, file, mime, receivedAt }) => ({ id, hackathonId, hackathonTitle, title, url: url && link(url), file, mime, receivedAt }));
    return { hackathons, certificates };
  });
}
