import { withAccount } from "@/lib/auth";
import { getHackathon } from "@/lib/repo";
import { badRequest, readJson, text, validFields } from "@/lib/validation";
import { AiUnavailableError } from "@/lib/ai";
import { draftRetro, getRetro, listCertificates, listPrizes, saveRetro } from "@/lib/wrapup";
import type { Retro } from "@/lib/types";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

async function get(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  return Response.json({ retro: getRetro(id), prizes: listPrizes(id), certificates: listCertificates(id) });
}

/** Save retro notes. */
async function put(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, { wentWell: text, improve: text, lessons: text, rating: (v) => v === null || (Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 5) })) return badRequest("Invalid retro fields");
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => ['wentWell', 'improve', 'lessons', 'rating'].includes(key))) as Partial<Retro>;
  return Response.json({ retro: saveRetro(id, patch) });
}

/** AI draft of the retro from your activity (not saved until you save it). */
async function post(_req: Request, { params }: Ctx) {
  try {
    return Response.json({ draft: await draftRetro(decodeURIComponent((await params).id)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof AiUnavailableError ? 503 : 500 });
  }
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const PUT = withAccount(put);
export const POST = withAccount(post);
