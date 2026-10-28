import { addChecklistItem, listChecklist, rebuildChecklist } from "@/lib/submission";
import type { ChecklistKind } from "@/lib/types";
import { connection } from "next/server";
import { getHackathon } from "@/lib/repo";
import { badRequest, boolean, readJson, text, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  return Response.json({ items: listChecklist(id) });
}

export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const b = await readJson(req);
  if (b instanceof Response) return b;
  if (!validFields(b, { label: text, required: boolean, kind: (v) => ["check", "link", "file"].includes(v as string) })) return badRequest("Invalid checklist fields");
  if (b.action === "rebuild") {
    rebuildChecklist(id);
    return Response.json({ items: listChecklist(id) });
  }
  if (typeof b.label !== "string" || !b.label.trim()) return Response.json({ error: "Name the item" }, { status: 400 });
  addChecklistItem(id, b.label.trim(), (b.kind as ChecklistKind | undefined) ?? "check", (b.required as boolean | undefined) ?? true);
  return Response.json({ items: listChecklist(id) });
}
