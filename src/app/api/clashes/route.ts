import { withAccount } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import { badRequest, readJson } from "@/lib/validation";

const resolved = async (): Promise<string[]> => JSON.parse(await getSetting("resolvedClashes") ?? "[]");

/** Clashes you've marked resolved, by clashKey(). */
async function get() {
  return Response.json({ resolved: await resolved() });
}

/** { key, resolved: true | false }: hide a clash for good, or bring it back. */
async function post(req: Request) {
  const b = await readJson(req);
  if (b instanceof Response) return b;
  if (typeof b.key !== "string" || b.key.length > 500 || typeof b.resolved !== "boolean") return badRequest("Expected { key, resolved }");
  const next = new Set(await resolved());
  if (b.resolved) next.add(b.key);
  else next.delete(b.key);
  await setSetting("resolvedClashes", JSON.stringify([...next]));
  return Response.json({ resolved: [...next] });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
