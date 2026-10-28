import { withAccount } from "@/lib/auth";
import { getHackathon } from "@/lib/repo";
import { badRequest, readJson, text, validFields } from "@/lib/validation";
import { AiUnavailableError } from "@/lib/ai";
import { createIdea, listIdeas, suggestIdeas } from "@/lib/planning";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

const fail = (e: unknown) =>
  Response.json({ error: (e as Error).message }, { status: e instanceof AiUnavailableError ? 503 : 500 });

async function get(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ ideas: await listIdeas(decodeURIComponent((await params).id)) });
}

/**
 * { action: "suggest", interests? } → AI guidelines + idea seeds (not saved)
 * { action: "create", title, text } → save an idea you'll iterate on
 */
async function post(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!await getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (!validFields(raw, { action: text, interests: text, title: text, text: text })) return badRequest("Invalid request fields");
  const body = raw as { action: string; interests?: string; title?: string; text?: string };
  try {
    if (body.action === "suggest") return Response.json(await suggestIdeas(id, body.interests?.slice(0, 500) ?? ""));
    if (body.action === "create") {
      if (!body.text?.trim()) return Response.json({ error: "Describe the idea first" }, { status: 400 });
      await createIdea(id, body.title ?? "", body.text.trim());
      return Response.json({ ideas: await listIdeas(id) });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
