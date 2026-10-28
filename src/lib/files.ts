import "server-only";
import { randomUUID } from "node:crypto";
import { get, run } from "./db";

// User uploads (screenshots, certificates, demo videos, voice notes) live in the database's files table and are
// served by /api/files/[name]. Names are random UUIDs, so they can't be guessed or collide.

/**
 * Vercel's functions take request bodies up to about 4.5 MB, so uploads are capped below that there; a server of
 * your own can take much bigger ones.
 */
export const MAX_UPLOAD_BYTES = process.env.VERCEL ? 4 * 1024 * 1024 : 200 * 1024 * 1024;
const LIMIT_LABEL = process.env.VERCEL ? "4 MB" : "200 MB";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

const SAFE_NAME = /^[\w-]+\.\w+$/;

export async function saveFile(data: Buffer, mime: string): Promise<string> {
  const name = `${randomUUID()}.${EXT[mime] ?? "bin"}`;
  await run("INSERT INTO files (name, mime, data, created_at) VALUES (?, ?, ?, ?)", name, mime, data, new Date().toISOString());
  return name;
}

export async function readFile(name: string): Promise<Buffer | null> {
  if (!SAFE_NAME.test(name)) return null;
  const r = await get<{ data: Uint8Array }>("SELECT data FROM files WHERE name = ?", name);
  return r ? Buffer.from(r.data) : null;
}

export async function deleteFile(name: string | null | undefined) {
  if (name && SAFE_NAME.test(name)) await run("DELETE FROM files WHERE name = ?", name);
}

export function mimeOf(name: string): string {
  const ext = name.split(".").pop();
  return Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

export class UploadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Read an uploaded file from a multipart form. */
export async function fileFromForm(form: FormData, field = "file"): Promise<{ data: Buffer; mime: string } | null> {
  const f = form.get(field);
  if (!(f instanceof Blob) || f.size === 0) return null;
  if (f.size > MAX_UPLOAD_BYTES) throw new UploadError(`File is too large (max ${LIMIT_LABEL})`, 413);
  if (!Object.hasOwn(EXT, f.type)) throw new UploadError("Upload an image, PDF, or video", 400);
  return { data: Buffer.from(await f.arrayBuffer()), mime: f.type };
}
