import { getHackathon } from "@/lib/repo";
import { listStandups, MAX_AUDIO_BYTES, saveStandup, saveTextStandup, transcribeStandup } from "@/lib/standups";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ standups: listStandups(decodeURIComponent((await params).id)) });
}

/**
 * Voice: multipart upload of audio (file), author?, duration? — saved, then transcribed + summarised.
 * Written: JSON { author?, note?, done?, next?, blockers? } — typed lists are kept as is, a bare note is summarised.
 */
export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  if (req.headers.get("content-type")?.includes("application/json")) {
    const b = (await req.json()) as { author?: string; note?: string; done?: string[]; next?: string[]; blockers?: string[] };
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 30) : []);
    const note = (b.note ?? "").trim().slice(0, 5000);
    const parts = { done: list(b.done), next: list(b.next), blockers: list(b.blockers) };
    if (!note && !parts.done.length && !parts.next.length && !parts.blockers.length) {
      return Response.json({ error: "Write something first" }, { status: 400 });
    }
    await saveTextStandup(id, b.author?.trim() || null, note, parts);
    return Response.json({ standups: listStandups(id) });
  }
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No audio" }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES) return Response.json({ error: "Voice note is too long (max ~15 MB)" }, { status: 413 });
  const author = (form.get("author") as string | null)?.trim() || null;
  const duration = Number(form.get("duration")) || null;
  const standupId = saveStandup(id, Buffer.from(await audio.arrayBuffer()), audio.type || "audio/webm", author, duration);
  await transcribeStandup(standupId);
  return Response.json({ standups: listStandups(id) });
}
