import { withAccount } from "@/lib/auth";
import { createFromDraft, ImportError, previewFromUrl, validateImportDraft } from "@/lib/importHackathon";
import { listTracked } from "@/lib/repo";
import { badRequest, isHttpUrl, isResultKind, isTrackStatus, readJson } from "@/lib/validation";

/**
 * Add a hackathon from a link, or by hand (draft.url "").
 * { action: "preview", url }                    → read the page into a draft to check
 * { action: "create", draft, status, result? }  → save it, pinned at that stage
 */
async function post(req: Request) {
  const b = await readJson(req);
  if (b instanceof Response) return b;
  try {
    if (b.action === "preview") {
      if (!isHttpUrl(b.url)) return badRequest("Paste the full link, starting with https://");
      return Response.json(await previewFromUrl(b.url));
    }
    if (b.action === "create") {
      const draft = validateImportDraft(b.draft);
      const status = b.status;
      if (!isTrackStatus(status)) return badRequest("Pick where you are with it");
      const result = b.result ?? null;
      if (result !== null && !isResultKind(result)) return badRequest("Unknown result");
      const id = await createFromDraft(draft, { status, result });
      return Response.json({ id, tracked: await listTracked() });
    }
    return badRequest("Unknown action");
  } catch (e) {
    if (e instanceof ImportError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
