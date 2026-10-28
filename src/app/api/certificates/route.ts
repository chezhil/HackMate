import { fileFromForm, saveFile, UploadError } from "@/lib/files";
import { getHackathon } from "@/lib/repo";
import { addCertificate, listCertificates, missingCertificates } from "@/lib/wrapup";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ certificates: listCertificates(), missing: missingCertificates() });
}

/** Multipart: hackathonId, title, status ("pending" | "received"), url?, file? */
export async function POST(req: Request) {
  const form = await req.formData();
  const hackathonId = String(form.get("hackathonId") ?? "");
  if (!getHackathon(hackathonId)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  try {
    const file = await fileFromForm(form);
    addCertificate(hackathonId, {
      title: String(form.get("title") ?? "").trim(),
      status: form.get("status") === "received" ? "received" : "pending",
      url: String(form.get("url") ?? "").trim() || null,
      file: file ? saveFile(file.data, file.mime) : null,
      mime: file?.mime ?? null,
    });
    return Response.json({ certificates: listCertificates(), missing: missingCertificates() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof UploadError ? e.status : 400 });
  }
}
