import { withAccount } from "@/lib/auth";
import { createFromDraft, ImportError, previewFromUrl, type ImportDraft } from "@/lib/importHackathon";
import { listTracked } from "@/lib/repo";
import { RESULT_LABELS, STATUSES, type ResultKind, type TrackStatus } from "@/lib/types";
import { badRequest, isHttpUrl, readJson } from "@/lib/validation";

/**
 * Add a hackathon from a link.
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
      const d = b.draft as ImportDraft | undefined;
      if (!d || typeof d !== "object" || !isHttpUrl(d.url) || typeof d.title !== "string") return badRequest("Missing hackathon details");
      if (!["online", "offline", "hybrid"].includes(d.mode)) return badRequest("Pick online, in person or hybrid");
      const status = b.status as TrackStatus;
      if (!STATUSES.some((s) => s.key === status)) return badRequest("Pick where you are with it");
      const result = (b.result ?? null) as ResultKind | null;
      if (result !== null && !(result in RESULT_LABELS)) return badRequest("Unknown result");
      const id = createFromDraft({ ...d, themes: Array.isArray(d.themes) ? d.themes : [] }, { status, result });
      return Response.json({ id, tracked: listTracked() });
    }
    return badRequest("Unknown action");
  } catch (e) {
    const status = e instanceof ImportError ? 400 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
