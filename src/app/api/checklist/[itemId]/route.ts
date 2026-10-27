import { fileFromForm, saveFile } from "@/lib/files";
import { deleteChecklistItem, itemHackathon, listChecklist, updateChecklistItem } from "@/lib/submission";
import type { ChecklistItem } from "@/lib/types";

type Ctx = { params: Promise<{ itemId: string }> };

async function itemOr404(params: Ctx["params"]) {
  const itemId = Number((await params).itemId);
  return { itemId, hackathonId: itemHackathon(itemId) };
}

/** JSON: { done?, value?, label?, required? } */
export async function PATCH(req: Request, { params }: Ctx) {
  const { itemId, hackathonId } = await itemOr404(params);
  if (!hackathonId) return Response.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json()) as { done?: boolean; value?: string | null; label?: string; required?: boolean };
  updateChecklistItem(itemId, {
    done: b.done,
    value: b.value === undefined ? undefined : b.value?.trim() || null,
    label: typeof b.label === "string" ? b.label.slice(0, 200) : undefined,
    required: typeof b.required === "boolean" ? b.required : undefined,
  });
  return Response.json({ items: listChecklist(hackathonId) });
}

/** Multipart upload of the proof (screenshot / video / PDF). Optional `durationSec` for videos. */
export async function POST(req: Request, { params }: Ctx) {
  const { itemId, hackathonId } = await itemOr404(params);
  if (!hackathonId) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const form = await req.formData();
    const file = await fileFromForm(form);
    if (!file) return Response.json({ error: "No file" }, { status: 400 });
    const duration = Number(form.get("durationSec")) || undefined;
    const meta: ChecklistItem["meta"] = duration ? { durationSec: duration } : null;
    updateChecklistItem(itemId, { file: saveFile(file.data, file.mime), mime: file.mime, ...(meta ? { meta } : {}) });
    return Response.json({ items: listChecklist(hackathonId) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 413 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { itemId, hackathonId } = await itemOr404(params);
  if (!hackathonId) return Response.json({ error: "Not found" }, { status: 404 });
  // ?file only removes the attachment; otherwise the whole item goes
  if (new URL(req.url).searchParams.has("file")) updateChecklistItem(itemId, { file: null, mime: null, done: false });
  else deleteChecklistItem(itemId);
  return Response.json({ items: listChecklist(hackathonId) });
}
