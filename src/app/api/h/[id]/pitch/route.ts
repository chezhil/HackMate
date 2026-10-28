import { getHackathon } from "@/lib/repo";
import { badRequest, readJson, text, validFields } from "@/lib/validation";
import { AiUnavailableError } from "@/lib/ai";
import { generatePitch, generateVideoScript, generateWriteup, listOutputs, roastDeck, videoLimitSec } from "@/lib/pitch";
import type { Writeup } from "@/lib/types";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  return Response.json({ outputs: listOutputs(id), videoLimitSec: videoLimitSec(id) });
}

/**
 * { kind: "pitch", minutes, audience } | { kind: "video", seconds } | { kind: "roast", script }
 * | { kind: "writeup", platform, extra }
 */
export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (!validFields(raw, { kind: text, audience: text, script: text, extra: text, platform: text, minutes: (v) => typeof v === "number" && Number.isFinite(v), seconds: (v) => typeof v === "number" && Number.isFinite(v) })) return badRequest("Invalid request fields");
  const b = raw as { kind: string; minutes?: number; audience?: string; seconds?: number; script?: string; platform?: Writeup["platform"]; extra?: string };
  try {
    let output;
    if (b.kind === "pitch") output = await generatePitch(id, Math.min(10, Math.max(0.5, Number(b.minutes) || 3)), b.audience?.slice(0, 200) ?? "");
    else if (b.kind === "video") output = await generateVideoScript(id, Math.min(600, Math.max(30, Number(b.seconds) || 120)));
    else if (b.kind === "roast") {
      if (!b.script?.trim()) return Response.json({ error: "Paste your pitch script or deck text first" }, { status: 400 });
      output = await roastDeck(id, b.script.slice(0, 12_000));
    } else if (b.kind === "writeup") {
      if (!["linkedin", "x", "devto"].includes(b.platform ?? "")) return Response.json({ error: "Pick a platform" }, { status: 400 });
      output = await generateWriteup(id, b.platform!, b.extra?.slice(0, 1000) ?? "");
    } else return Response.json({ error: "Unknown kind" }, { status: 400 });
    return Response.json({ output, outputs: listOutputs(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof AiUnavailableError ? 503 : 500 });
  }
}
