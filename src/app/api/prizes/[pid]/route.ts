import { withAccount } from "@/lib/auth";
import { badRequest, prizeRules, readJson, validFields } from "@/lib/validation";
import type { Prize } from "@/lib/types";
import { deletePrize, listPrizes, prizeHackathon, updatePrize } from "@/lib/wrapup";

type Ctx = { params: Promise<{ pid: string }> };

async function patch(req: Request, { params }: Ctx) {
  const pid = Number((await params).pid);
  if (!await prizeHackathon(pid)) return Response.json({ error: "Not found" }, { status: 404 });
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (raw.amount === "") raw.amount = null;
  if (!validFields(raw, prizeRules)) return badRequest("Invalid prize fields");
  const b = Object.fromEntries(Object.entries(raw).filter(([key]) => Object.hasOwn(prizeRules, key))) as Partial<Prize>;
  if (b.amount !== undefined) b.amount = b.amount === null || (b.amount as unknown) === "" ? null : Number(b.amount);
  await updatePrize(pid, b);
  return Response.json({ prizes: await listPrizes() });
}

async function remove(_req: Request, { params }: Ctx) {
  await deletePrize(Number((await params).pid));
  return Response.json({ prizes: await listPrizes() });
}

// Every request reads and writes the signed-in person's own data.
export const PATCH = withAccount(patch);
export const DELETE = withAccount(remove);
