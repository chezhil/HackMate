import { deleteDeadline, listTracked, updateDeadline } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const patch = (await req.json()) as { label?: string; dueAt?: string; done?: boolean };
  if (patch.dueAt) patch.dueAt = new Date(patch.dueAt).toISOString();
  try {
    updateDeadline(id, patch);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  return Response.json({ tracked: listTracked() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteDeadline(Number((await params).id));
  return Response.json({ tracked: listTracked() });
}
