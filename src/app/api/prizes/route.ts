import { withAccount } from "@/lib/auth";
import { badRequest, prizeRules, readJson, text, validFields } from "@/lib/validation";
import { getHackathon } from "@/lib/repo";
import type { Prize } from "@/lib/types";
import { addPrize, listPrizes } from "@/lib/wrapup";
import { connection } from "next/server";

async function get() {
  await connection();
  return Response.json({ prizes: await listPrizes() });
}

async function post(req: Request) {
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (raw.amount === "") raw.amount = null;
  if (!text(raw.hackathonId) || !validFields(raw, prizeRules)) return badRequest("Invalid prize fields");
  const b = raw as Partial<Prize> & { hackathonId: string };
  if (!await getHackathon(b.hackathonId)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  await addPrize(b.hackathonId, { ...b, amount: b.amount != null && b.amount !== ("" as unknown) ? Number(b.amount) : null });
  return Response.json({ prizes: await listPrizes() });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
