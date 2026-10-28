import { withAccount } from "@/lib/auth";
import { addChecklistItem, listChecklist, rebuildChecklist } from "@/lib/submission";
import type { ChecklistKind } from "@/lib/types";
import { connection } from "next/server";
import { getHackathon } from "@/lib/repo";
import { badRequest, boolean, readJson, text, validFields, decodeParam } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function get(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeParam((await params).id);
  if (!await getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  return Response.json({ items: await listChecklist(id) });
}

async function post(req: Request, { params }: Ctx) {
  const id = decodeParam((await params).id);
  if (!await getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const b = await readJson(req);
  if (b instanceof Response) return b;
  if (!validFields(b, { label: text, required: boolean, kind: (v) => ["check", "link", "file"].includes(v as string) })) return badRequest("Invalid checklist fields");
  if (b.action === "rebuild") {
    await rebuildChecklist(id);
    return Response.json({ items: await listChecklist(id) });
  }
  if (typeof b.label !== "string" || !b.label.trim()) return Response.json({ error: "Name the item" }, { status: 400 });
  await addChecklistItem(id, b.label.trim(), (b.kind as ChecklistKind | undefined) ?? "check", (b.required as boolean | undefined) ?? true);
  return Response.json({ items: await listChecklist(id) });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
