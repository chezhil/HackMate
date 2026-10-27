import "server-only";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR } from "./db";

// User uploads (screenshots, certificates, demo videos) live in data/files and are served by
// /api/files/[name]. Names are random UUIDs, so they can't be guessed or collide.

const FILES_DIR = path.join(DATA_DIR, "files");
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function saveFile(data: Buffer, mime: string): string {
  mkdirSync(FILES_DIR, { recursive: true });
  const name = `${randomUUID()}.${EXT[mime] ?? "bin"}`;
  writeFileSync(path.join(FILES_DIR, name), data);
  return name;
}

export function readFile(name: string): Buffer | null {
  if (!/^[\w-]+\.\w+$/.test(name)) return null; // no path tricks
  try {
    return readFileSync(path.join(FILES_DIR, name));
  } catch {
    return null;
  }
}

export function deleteFile(name: string | null | undefined) {
  if (name && /^[\w-]+\.\w+$/.test(name)) rmSync(path.join(FILES_DIR, name), { force: true });
}

export function mimeOf(name: string): string {
  const ext = name.split(".").pop();
  return Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
}

/** Read an uploaded file from a multipart form. */
export async function fileFromForm(form: FormData, field = "file"): Promise<{ data: Buffer; mime: string } | null> {
  const f = form.get(field);
  if (!(f instanceof Blob) || f.size === 0) return null;
  if (f.size > MAX_UPLOAD_BYTES) throw new Error("File is too large (max 200 MB)");
  return { data: Buffer.from(await f.arrayBuffer()), mime: f.type || "application/octet-stream" };
}
