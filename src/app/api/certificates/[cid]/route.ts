import { fileFromForm, saveFile } from "@/lib/files";
import { certificateHackathon, deleteCertificate, listCertificates, missingCertificates, updateCertificate } from "@/lib/wrapup";

type Ctx = { params: Promise<{ cid: string }> };

const payload = () => Response.json({ certificates: listCertificates(), missing: missingCertificates() });

/** JSON { title?, url?, status? } or multipart with a file. */
export async function PATCH(req: Request, { params }: Ctx) {
  const cid = Number((await params).cid);
  if (!certificateHackathon(cid)) return Response.json({ error: "Not found" }, { status: 404 });
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const file = await fileFromForm(await req.formData());
    if (file) updateCertificate(cid, { file: saveFile(file.data, file.mime), mime: file.mime });
  } else {
    updateCertificate(cid, (await req.json()) as { title?: string; url?: string | null; status?: "pending" | "received" });
  }
  return payload();
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteCertificate(Number((await params).cid));
  return payload();
}
