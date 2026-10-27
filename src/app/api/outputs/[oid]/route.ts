import { deleteOutput } from "@/lib/pitch";

type Ctx = { params: Promise<{ oid: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteOutput(Number((await params).oid));
  return Response.json({ ok: true });
}
