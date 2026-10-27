import { AiUnavailableError } from "@/lib/ai";
import { draftRetro, getRetro, listCertificates, listPrizes, saveRetro } from "@/lib/wrapup";
import type { Retro } from "@/lib/types";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  return Response.json({ retro: getRetro(id), prizes: listPrizes(id), certificates: listCertificates(id) });
}

/** Save retro notes. */
export async function PUT(req: Request, { params }: Ctx) {
  const b = (await req.json()) as Partial<Retro>;
  return Response.json({ retro: saveRetro(decodeURIComponent((await params).id), b) });
}

/** AI draft of the retro from your activity (not saved until you save it). */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    return Response.json({ draft: await draftRetro(decodeURIComponent((await params).id)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof AiUnavailableError ? 503 : 500 });
  }
}
