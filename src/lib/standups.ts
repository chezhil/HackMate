import "server-only";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AiUnavailableError, generateJson, transcribe } from "./ai";
import { DATA_DIR, db } from "./db";
import type { Standup } from "./types";

const AUDIO_DIR = path.join(DATA_DIR, "audio");
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" };
// Gemini takes inline audio up to ~20 MB per request; a few minutes of webm/opus is well under that.
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

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

function row(id: number): Row | undefined {
  return db().prepare("SELECT * FROM standups WHERE id = ?").get(id) as Row | undefined;
}

export function listStandups(hackathonId: string): Standup[] {
  return (db().prepare("SELECT * FROM standups WHERE hackathon_id = ? ORDER BY id DESC").all(hackathonId) as Row[]).map(toStandup);
}

export function saveStandup(hackathonId: string, audio: Buffer, mime: string, author: string | null, durationSec: number | null): number {
  mkdirSync(AUDIO_DIR, { recursive: true });
  const baseMime = mime.split(";")[0];
  const file = `${randomUUID()}.${EXT[baseMime] ?? "webm"}`;
  writeFileSync(path.join(AUDIO_DIR, file), audio);
  const r = db()
    .prepare("INSERT INTO standups (hackathon_id, author, file, mime, duration_sec, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
    .get(hackathonId, author, file, baseMime, durationSec, new Date().toISOString()) as { id: number };
  return r.id;
}

type Summary = { done: string[]; next: string[]; blockers: string[] };

/**
 * A written standup. If you filled in done / next / blockers yourself it's saved as is (no AI needed);
 * a free-form note is split into those three by the AI, like a voice note.
 */
export async function saveTextStandup(hackathonId: string, author: string | null, note: string, parts: Summary): Promise<number> {
  const typed = parts.done.length + parts.next.length + parts.blockers.length > 0;
  const r = db()
    .prepare("INSERT INTO standups (hackathon_id, author, file, mime, transcript, summary, created_at) VALUES (?, ?, '', ?, ?, ?, ?) RETURNING id")
    .get(hackathonId, author, TEXT_MIME, note || null, typed ? JSON.stringify(parts) : null, new Date().toISOString()) as { id: number };
  if (!typed && note) await summarizeText(r.id);
  return r.id;
}

async function summarizeText(id: number) {
  const r = row(id);
  if (!r?.transcript) return;
  try {
    const res = await generateJson<Summary>({
      task: "summarize",
      temperature: 0.1,
      system: `Summarise this hackathon stand-up note. Reply with JSON ${SUMMARY_SHAPE}.`,
      messages: [{ role: "user", content: r.transcript }],
    });
    db().prepare("UPDATE standups SET summary = ?, error = NULL WHERE id = ?").run(JSON.stringify(res.data), id);
  } catch (e) {
    const msg = e instanceof AiUnavailableError ? e.message : `Couldn't summarise: ${(e as Error).message}`;
    db().prepare("UPDATE standups SET error = ? WHERE id = ?").run(msg, id);
  }
}

export function standupAudio(id: number): { data: Buffer; mime: string } | null {
  const r = row(id);
  if (!r || !r.file) return null;
  return { data: readFileSync(path.join(AUDIO_DIR, r.file)), mime: r.mime };
}

export function deleteStandup(id: number) {
  const r = row(id);
  if (!r) return;
  // Written standups have no file; never pass an empty name, which would point at the audio folder itself.
  if (r.file) rmSync(path.join(AUDIO_DIR, path.basename(r.file)), { force: true });
  db().prepare("DELETE FROM standups WHERE id = ?").run(id);
}

export function standupHackathon(id: number) {
  return row(id)?.hackathon_id ?? null;
}

const SUMMARY_SHAPE = '{ "done": string[], "next": string[], "blockers": string[] } — short items, empty arrays if nothing fits';

/**
 * Transcribe a voice note and split it into done / next / blockers. Gemini hears the audio directly
 * (one call); if it's unavailable, Groq's Whisper transcribes and Groq summarises.
 */
export async function transcribeStandup(id: number): Promise<Standup> {
  const r = row(id);
  if (!r) throw new Error("Standup not found");
  // Retrying a written standup re-runs the summary; there's nothing to transcribe.
  if (r.mime === TEXT_MIME) {
    await summarizeText(id);
    return toStandup(row(id)!);
  }
  const audio = readFileSync(path.join(AUDIO_DIR, r.file));
  const save = (transcript: string, summary: Summary) =>
    db().prepare("UPDATE standups SET transcript = ?, summary = ?, error = NULL WHERE id = ?").run(transcript, JSON.stringify(summary), id);
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
      save(transcript, summary);
    } catch (e) {
      console.warn("[standup] Gemini audio failed, falling back to Whisper:", (e as Error).message);
      const transcript = await transcribe(audio, r.mime);
      const res = await generateJson<Summary>({
        task: "summarize",
        temperature: 0.1,
        system: `Summarise this hackathon stand-up transcript. Reply with JSON ${SUMMARY_SHAPE}.`,
        messages: [{ role: "user", content: transcript || "(silence)" }],
      });
      save(transcript, res.data);
    }
  } catch (e) {
    const msg = e instanceof AiUnavailableError ? e.message : `Transcription failed: ${(e as Error).message}`;
    db().prepare("UPDATE standups SET error = ? WHERE id = ?").run(msg, id);
  }
  return toStandup(row(id)!);
}
