import { deleteDeadline, listTracked, updateDeadline } from "@/lib/repo";
import { badRequest, boolean, isDate, isPositiveId, readJson, text, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  if (!isPositiveId(id)) return badRequest("Invalid deadline ID");
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, { label: (v) => text(v) && Boolean(v.trim()), dueAt: isDate, done: boolean })) return badRequest("Invalid deadline fields");
  const patch = {
    label: body.label as string | undefined,
    dueAt: body.dueAt === undefined ? undefined : new Date(body.dueAt as string).toISOString(),
    done: body.done as boolean | undefined,
  };
  try { updateDeadline(id, patch); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 404 }); }
  return Response.json({ tracked: listTracked() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const id = Number((await params).id);
  if (!isPositiveId(id)) return badRequest("Invalid deadline ID");
  deleteDeadline(id);
  return Response.json({ tracked: listTracked() });
}
