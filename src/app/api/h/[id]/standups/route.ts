import { withAccount } from "@/lib/auth";
import { badRequest, readJson, text, validFields } from "@/lib/validation";
import { getHackathon } from "@/lib/repo";
import { listStandups, MAX_AUDIO_BYTES, saveStandup, saveTextStandup, transcribeStandup } from "@/lib/standups";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

async function get(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ standups: await listStandups(decodeURIComponent((await params).id)) });
}

/**
 * Voice: multipart upload of audio (file), author?, duration? — saved, then transcribed + summarised.
 * Written: JSON { author?, note?, done?, next?, blockers? } — typed lists are kept as is, a bare note is summarised.
 */
async function post(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!await getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  if (req.headers.get("content-type")?.includes("application/json")) {
    const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (!validFields(raw, { author: text, note: text, done: (v) => Array.isArray(v) && v.every(text), next: (v) => Array.isArray(v) && v.every(text), blockers: (v) => Array.isArray(v) && v.every(text) })) return badRequest("Invalid request fields");
  const b = raw as { author?: string; note?: string; done?: string[]; next?: string[]; blockers?: string[] };
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 30) : []);
    const note = (b.note ?? "").trim().slice(0, 5000);
    const parts = { done: list(b.done), next: list(b.next), blockers: list(b.blockers) };
    if (!note && !parts.done.length && !parts.next.length && !parts.blockers.length) {
      return Response.json({ error: "Write something first" }, { status: 400 });
    }
    await saveTextStandup(id, b.author?.trim() || null, note, parts);
    return Response.json({ standups: await listStandups(id) });
  }
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio" }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "Voice note is too long (max ~15 MB)" }, { status: 413 });
  const author = (form.get("author") as string | null)?.trim() || null;
  const duration = Number(form.get("duration")) || null;
  const standupId = await saveStandup(id, Buffer.from(await audio.arrayBuffer()), audio.type || "audio/webm", author, duration);
  await transcribeStandup(standupId);
  return Response.json({ standups: await listStandups(id) });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
