import "server-only";
import { AiUnavailableError, generateJson, transcribe } from "./ai";
import { all, get, run } from "./db";
import { deleteFile, MAX_UPLOAD_BYTES, readFile, saveFile } from "./files";
import type { Standup } from "./types";

// Gemini takes inline audio up to ~20 MB per request; a few minutes of webm/opus is well under that. On Vercel
// the request itself is capped lower (see files.ts), which is still several minutes of speech.
export const MAX_AUDIO_BYTES = Math.min(15 * 1024 * 1024, MAX_UPLOAD_BYTES);

type Row = {
  id: number;
  hackathon_id: string;
  author: string | null;
  file: string;
  mime: string;
  duration_sec: number | null;
  transcript: string | null;
  summary: string | null;
  error: string | null;
  created_at: string;
};

/** Written standups share the table: no audio file, mime "text/plain", the note kept as the transcript. */
const TEXT_MIME = "text/plain";

function toStandup(r: Row): Standup {
  return {
    id: r.id,
    kind: r.mime === TEXT_MIME ? "text" : "voice",
    author: r.author,
    mime: r.mime,
    durationSec: r.duration_sec,
    transcript: r.transcript,
    summary: r.summary ? JSON.parse(r.summary) : null,
    error: r.error,
    createdAt: r.created_at,
  };
}

async function row(id: number): Promise<Row | undefined> {
  return (await get("SELECT * FROM standups WHERE id = ?", id)) as Row | undefined;
}

export async function listStandups(hackathonId: string): Promise<Standup[]> {
  return ((await all("SELECT * FROM standups WHERE hackathon_id = ? ORDER BY id DESC", hackathonId)) as Row[]).map(toStandup);
}

export async function saveStandup(hackathonId: string, audio: Buffer, mime: string, author: string | null, durationSec: number | null): Promise<number> {
  const baseMime = mime.split(";")[0];
  const file = await saveFile(audio, baseMime);
  const r = (await get("INSERT INTO standups (hackathon_id, author, file, mime, duration_sec, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id", hackathonId, author, file, baseMime, durationSec, new Date().toISOString())) as { id: number };
  return r.id;
}

type Summary = { done: string[]; next: string[]; blockers: string[] };

/**
 * A written standup. If you filled in done / next / blockers yourself it's saved as is (no AI needed);
 * a free-form note is split into those three by the AI, like a voice note.
 */
export async function saveTextStandup(hackathonId: string, author: string | null, note: string, parts: Summary): Promise<number> {
  const typed = parts.done.length + parts.next.length + parts.blockers.length > 0;
  const r = (await get("INSERT INTO standups (hackathon_id, author, file, mime, transcript, summary, created_at) VALUES (?, ?, '', ?, ?, ?, ?) RETURNING id", hackathonId, author, TEXT_MIME, note || null, typed ? JSON.stringify(parts) : null, new Date().toISOString())) as { id: number };
  if (!typed && note) await summarizeText(r.id);
  return r.id;
}

async function summarizeText(id: number) {
  const r = await row(id);
  if (!r?.transcript) return;
  try {
    const res = await generateJson<Summary>({
      task: "summarize",
      temperature: 0.1,
      system: `Summarise this hackathon stand-up note. Reply with JSON ${SUMMARY_SHAPE}.`,
      messages: [{ role: "user", content: r.transcript }],
    });
    (await run("UPDATE standups SET summary = ?, error = NULL WHERE id = ?", JSON.stringify(res.data), id));
  } catch (e) {
    const msg = e instanceof AiUnavailableError ? e.message : `Couldn't summarise: ${(e as Error).message}`;
    (await run("UPDATE standups SET error = ? WHERE id = ?", msg, id));
  }
}

export async function standupAudio(id: number): Promise<{ data: Buffer; mime: string } | null> {
  const r = await row(id);
  if (!r || !r.file) return null;
  const data = await readFile(r.file);
  return data ? { data, mime: r.mime } : null;
}

export async function deleteStandup(id: number) {
  const r = await row(id);
  if (!r) return;
  // Written standups have no file.
  if (r.file) await deleteFile(r.file);
  (await run("DELETE FROM standups WHERE id = ?", id));
}

export async function standupHackathon(id: number) {
  return (await row(id))?.hackathon_id ?? null;
}

const SUMMARY_SHAPE = '{ "done": string[], "next": string[], "blockers": string[] } — short items, empty arrays if nothing fits';

/**
 * Transcribe a voice note and split it into done / next / blockers. Gemini hears the audio directly
 * (one call); if it's unavailable, Groq's Whisper transcribes and Groq summarises.
 */
export async function transcribeStandup(id: number): Promise<Standup> {
  const r = await row(id);
  if (!r) throw new Error("Standup not found");
  // Retrying a written standup re-runs the summary; there's nothing to transcribe.
  if (r.mime === TEXT_MIME) {
    await summarizeText(id);
    return toStandup((await row(id))!);
  }
  const audio = await readFile(r.file);
  if (!audio) throw new Error("The recording is missing");
  const save = async (transcript: string, summary: Summary) =>
    (await run("UPDATE standups SET transcript = ?, summary = ?, error = NULL WHERE id = ?", transcript, JSON.stringify(summary), id));
  try {
    try {
      const res = await generateJson<Summary & { transcript: string }>({
        task: "audio",
        temperature: 0.1,
        system: `Transcribe this hackathon team stand-up voice note, then summarise it. Reply with JSON { "transcript": string, ...${SUMMARY_SHAPE} }.`,
        messages: [{ role: "user", content: "Here is the voice note." }],
        media: { mime: r.mime, base64: audio.toString("base64") },
      });
      const { transcript, ...summary } = res.data;
      await save(transcript, summary);
    } catch (e) {
      console.warn("[standup] Gemini audio failed, falling back to Whisper:", (e as Error).message);
      const transcript = await transcribe(audio, r.mime);
      const res = await generateJson<Summary>({
        task: "summarize",
        temperature: 0.1,
        system: `Summarise this hackathon stand-up transcript. Reply with JSON ${SUMMARY_SHAPE}.`,
        messages: [{ role: "user", content: transcript || "(silence)" }],
      });
      await save(transcript, res.data);
    }
  } catch (e) {
    const msg = e instanceof AiUnavailableError ? e.message : `Transcription failed: ${(e as Error).message}`;
    (await run("UPDATE standups SET error = ? WHERE id = ?", msg, id));
  }
  return toStandup((await row(id))!);
}
