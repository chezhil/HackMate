import { withAccount } from "@/lib/auth";
import { badRequest, readJson } from "@/lib/validation";
import { AiUnavailableError } from "@/lib/ai";
import { critiqueIdea, deleteIdea, renameIdea } from "@/lib/planning";

type Ctx = { params: Promise<{ ideaId: string }> };

/** { text } → saves a new version of the idea and critiques it. */
async function post(req: Request, { params }: Ctx) {
  const ideaId = Number((await params).ideaId);
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const text = body.text;
  if (typeof text !== "string") return badRequest("Describe the idea first");
  if (!text?.trim()) return Response.json({ error: "Describe the idea first" }, { status: 400 });
  try {
    return Response.json({ idea: await critiqueIdea(ideaId, text.trim().slice(0, 6000)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof AiUnavailableError ? 503 : 500 });
  }
}

async function patch(req: Request, { params }: Ctx) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const title = body.title;
  if (typeof title !== "string" || !title.trim()) return badRequest("Name the idea");
  if (title?.trim()) renameIdea(Number((await params).ideaId), title.trim());
  return Response.json({ ok: true });
}

async function remove(_req: Request, { params }: Ctx) {
  deleteIdea(Number((await params).ideaId));
  return Response.json({ ok: true });
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
export const PATCH = withAccount(patch);
export const DELETE = withAccount(remove);
