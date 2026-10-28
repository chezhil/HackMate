import { withAccount } from "@/lib/auth";
import { fileFromForm, saveFile, UploadError } from "@/lib/files";
import { deleteChecklistItem, itemHackathon, listChecklist, updateChecklistItem } from "@/lib/submission";
import type { ChecklistItem } from "@/lib/types";
import { badRequest, boolean, nullableText, readJson, text, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ itemId: string }> };

async function itemOr404(params: Ctx["params"]) {
  const itemId = Number((await params).itemId);
  return { itemId, hackathonId: itemHackathon(itemId) };
}

/** JSON: { done?, value?, label?, required? } */
async function patch(req: Request, { params }: Ctx) {
  const { itemId, hackathonId } = await itemOr404(params);
  if (!hackathonId) return Response.json({ error: "Not found" }, { status: 404 });
  const b = await readJson(req);
  if (b instanceof Response) return b;
  if (!validFields(b, { done: boolean, value: nullableText, label: (v) => text(v) && Boolean(v.trim()), required: boolean })) return badRequest("Invalid checklist fields");
  updateChecklistItem(itemId, {
    done: b.done as boolean | undefined,
    value: b.value === undefined ? undefined : (b.value as string | null)?.trim() || null,
    label: typeof b.label === "string" ? b.label.slice(0, 200) : undefined,
    required: typeof b.required === "boolean" ? b.required : undefined,
  });
  return Response.json({ items: listChecklist(hackathonId) });
}

/** Multipart upload of the proof (screenshot / video / PDF). Optional `durationSec` for videos. */
async function post(req: Request, { params }: Ctx) {
  const { itemId, hackathonId } = await itemOr404(params);
  if (!hackathonId) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const form = await req.formData();
    const file = await fileFromForm(form);
    if (!file) return Response.json({ error: "No file" }, { status: 400 });
    const item = listChecklist(hackathonId).find((i) => i.id === itemId)!;
    const accept = item.meta?.accept;
    if ((accept === "image" && !file.mime.startsWith("image/")) || (accept === "video" && !file.mime.startsWith("video/")) || (accept === "pdf" && file.mime !== "application/pdf")) return badRequest(`This item requires ${accept}`);
    const rawDuration = form.get("durationSec");
    const duration = rawDuration === null ? undefined : Number(rawDuration);
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) return badRequest("Invalid video duration");
    const meta: ChecklistItem["meta"] = duration && file.mime.startsWith("video/") ? { durationSec: duration } : null;
    updateChecklistItem(itemId, { file: saveFile(file.data, file.mime), mime: file.mime, ...(meta ? { meta } : {}) });
    return Response.json({ items: listChecklist(hackathonId) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof UploadError ? e.status : 400 });
  }
}

async function remove(req: Request, { params }: Ctx) {
  const { itemId, hackathonId } = await itemOr404(params);
  if (!hackathonId) return Response.json({ error: "Not found" }, { status: 404 });
  // ?file only removes the attachment; otherwise the whole item goes
  if (new URL(req.url).searchParams.has("file")) updateChecklistItem(itemId, { file: null, mime: null, done: false });
  else deleteChecklistItem(itemId);
  return Response.json({ items: listChecklist(hackathonId) });
}

// Every request reads and writes the signed-in person's own data.
export const PATCH = withAccount(patch);
export const POST = withAccount(post);
export const DELETE = withAccount(remove);
