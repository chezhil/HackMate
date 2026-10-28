import { AuthError, currentUser, signIn, signOut, signUp } from "@/lib/auth";
import { badRequest, readJson } from "@/lib/validation";

/** Who's signed in: { user } or { user: null }. */
export async function GET() {
  return Response.json({ user: await currentUser() });
}

/**
 * { action: "signup", username, email, password }
 * { action: "signin", email, password }
 * { action: "signout" }
 */
export async function POST(req: Request) {
  const b = await readJson(req);
  if (b instanceof Response) return b;
  // Only send the cookie over https when the site is served over https (plain http on localhost would drop it).
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const str = (v: unknown) => (typeof v === "string" ? v : "");
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
