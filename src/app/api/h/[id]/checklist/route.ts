import { addChecklistItem, listChecklist } from "@/lib/submission";
import type { ChecklistKind } from "@/lib/types";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ items: listChecklist(decodeURIComponent((await params).id)) });
}

export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const b = (await req.json()) as { label?: string; kind?: ChecklistKind; required?: boolean };
  if (!b.label?.trim()) return Response.json({ error: "Name the item" }, { status: 400 });
  addChecklistItem(id, b.label.trim(), b.kind && ["check", "link", "file"].includes(b.kind) ? b.kind : "check", b.required ?? true);
  return Response.json({ items: listChecklist(id) });
}
