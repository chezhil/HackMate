import { readForm } from "@/lib/validation";
import { withAccount } from "@/lib/auth";
import { fileFromForm, saveFile, UploadError } from "@/lib/files";
import { getHackathon } from "@/lib/repo";
import { addCertificate, listCertificates, missingCertificates } from "@/lib/wrapup";
import { connection } from "next/server";

async function get() {
  await connection();
  return Response.json({ certificates: await listCertificates(), missing: await missingCertificates() });
}

/** Multipart: hackathonId, title, status ("pending" | "received"), url?, file? */
async function post(req: Request) {
  const form = await readForm(req);
  if (form instanceof Response) return form;
  const hackathonId = String(form.get("hackathonId") ?? "");
  if (!await getHackathon(hackathonId)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  try {
    const file = await fileFromForm(form);
    await addCertificate(hackathonId, {
      title: String(form.get("title") ?? "").trim(),
      status: form.get("status") === "received" ? "received" : "pending",
      url: String(form.get("url") ?? "").trim() || null,
      file: file ? await saveFile(file.data, file.mime) : null,
      mime: file?.mime ?? null,
    });
    return Response.json({ certificates: await listCertificates(), missing: await missingCertificates() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof UploadError ? e.status : 400 });
  }
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
