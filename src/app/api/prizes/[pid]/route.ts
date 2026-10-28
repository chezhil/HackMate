import { badRequest, prizeRules, readJson, validFields } from "@/lib/validation";
import type { Prize } from "@/lib/types";
import { deletePrize, listPrizes, prizeHackathon, updatePrize } from "@/lib/wrapup";

type Ctx = { params: Promise<{ pid: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const pid = Number((await params).pid);
  if (!prizeHackathon(pid)) return Response.json({ error: "Not found" }, { status: 404 });
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (raw.amount === "") raw.amount = null;
  if (!validFields(raw, prizeRules)) return badRequest("Invalid prize fields");
  const b = Object.fromEntries(Object.entries(raw).filter(([key]) => Object.hasOwn(prizeRules, key))) as Partial<Prize>;
  if (b.amount !== undefined) b.amount = b.amount === null || (b.amount as unknown) === "" ? null : Number(b.amount);
  updatePrize(pid, b);
  return Response.json({ prizes: listPrizes() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deletePrize(Number((await params).pid));
  return Response.json({ prizes: listPrizes() });
}
