import type { Prize } from "@/lib/types";
import { deletePrize, listPrizes, prizeHackathon, updatePrize } from "@/lib/wrapup";

type Ctx = { params: Promise<{ pid: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const pid = Number((await params).pid);
  if (!prizeHackathon(pid)) return Response.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json()) as Partial<Prize>;
  if (b.amount !== undefined) b.amount = b.amount === null || (b.amount as unknown) === "" ? null : Number(b.amount);
  updatePrize(pid, b);
  return Response.json({ prizes: listPrizes() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deletePrize(Number((await params).pid));
  return Response.json({ prizes: listPrizes() });
}
