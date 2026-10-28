import { badRequest, prizeRules, readJson, text, validFields } from "@/lib/validation";
import { getHackathon } from "@/lib/repo";
import type { Prize } from "@/lib/types";
import { addPrize, listPrizes } from "@/lib/wrapup";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ prizes: listPrizes() });
}

export async function POST(req: Request) {
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (raw.amount === "") raw.amount = null;
  if (!text(raw.hackathonId) || !validFields(raw, prizeRules)) return badRequest("Invalid prize fields");
  const b = raw as Partial<Prize> & { hackathonId: string };
  if (!getHackathon(b.hackathonId)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  addPrize(b.hackathonId, { ...b, amount: b.amount != null && b.amount !== ("" as unknown) ? Number(b.amount) : null });
  return Response.json({ prizes: listPrizes() });
}
