import { AuthError, currentUser, signIn, signOut, signUp, withAccount } from "@/lib/auth";
import { allow, clientIp, loginRequired, retryAt, tooMany } from "@/lib/request";
import { badRequest, readJson } from "@/lib/validation";

/** Who's signed in: { user } or { user: null }. */
async function get() {
  // loginRequired tells the app to ask signed-out visitors to sign in before personal pages.
  return Response.json({ user: await currentUser(), loginRequired: loginRequired() });
}

/**
 * { action: "signup", username, email, password }
 * { action: "signin", email, password }
 * { action: "signout" }
 */
async function post(req: Request) {
  const b = await readJson(req);
  if (b instanceof Response) return b;
  // Only send the cookie over https when the site is served over https (plain http on localhost would drop it).
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  // Per address: a handful of new accounts an hour, and a cap on sign-in attempts on top of the per-email one.
  const ip = clientIp() ?? "local";
  if (b.action === "signup" && !allow(`signup:${ip}`, 5, 3_600_000)) {
    return tooMany(`Too many new accounts from here. Try again after ${retryAt(`signup:${ip}`, 3_600_000).toLocaleTimeString()}.`);
  }
  if (b.action === "signin" && !allow(`signin:${ip}`, 30, 15 * 60_000)) return tooMany("Too many sign-in attempts. Wait 15 minutes and try again.");
  try {
    if (b.action === "signup") return Response.json({ user: await signUp({ username: str(b.username), email: str(b.email), password: str(b.password) }, secure) });
    if (b.action === "signin") return Response.json({ user: await signIn({ email: str(b.email), password: str(b.password) }, secure) });
    if (b.action === "signout") {
      await signOut();
      return Response.json({ user: null });
    }
    return badRequest("Unknown action");
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post, { open: true });
