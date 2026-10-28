import { withAccount } from "@/lib/auth";
import { deleteOutput } from "@/lib/pitch";

type Ctx = { params: Promise<{ oid: string }> };

async function remove(_req: Request, { params }: Ctx) {
  await deleteOutput(Number((await params).oid));
  return Response.json({ ok: true });
}

// Every request reads and writes the signed-in person's own data.
export const DELETE = withAccount(remove);
