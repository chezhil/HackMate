import { getHackathon } from "@/lib/repo";
import { listStandups, MAX_AUDIO_BYTES, saveStandup, transcribeStandup } from "@/lib/standups";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ standups: listStandups(decodeURIComponent((await params).id)) });
}

/** Multipart upload: audio (file), author?, duration? — saved, then transcribed + summarised. */
export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
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
