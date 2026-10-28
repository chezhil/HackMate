import { withAccount } from "@/lib/auth";
import { fileFromForm, saveFile, UploadError } from "@/lib/files";
import { badRequest, readJson, text, optionalUrl, validFields } from "@/lib/validation";
import { certificateHackathon, deleteCertificate, listCertificates, missingCertificates, updateCertificate } from "@/lib/wrapup";

type Ctx = { params: Promise<{ cid: string }> };

const payload = () => Response.json({ certificates: listCertificates(), missing: missingCertificates() });

/** JSON { title?, url?, status? } or multipart with a file. */
async function patch(req: Request, { params }: Ctx) {
  const cid = Number((await params).cid);
  if (!certificateHackathon(cid)) return Response.json({ error: "Not found" }, { status: 404 });
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    try {
      const file = await fileFromForm(await req.formData());
      if (file) updateCertificate(cid, { file: saveFile(file.data, file.mime), mime: file.mime });
    } catch (e) { return Response.json({ error: (e as Error).message }, { status: e instanceof UploadError ? e.status : 400 }); }
  } else {
    const body = await readJson(req);
    if (body instanceof Response) return body;
    if (!validFields(body, { title: text, url: optionalUrl, status: (v) => v === "pending" || v === "received" })) return badRequest("Invalid certificate fields");
    updateCertificate(cid, {
      ...(body.title === undefined ? {} : { title: (body.title as string).trim() }),
      ...(body.url === undefined ? {} : { url: body.url as string | null }),
      ...(body.status === undefined ? {} : { status: body.status as "pending" | "received" }),
    });
  }
  return payload();
}

async function remove(_req: Request, { params }: Ctx) {
  deleteCertificate(Number((await params).cid));
  return payload();
}

// Every request reads and writes the signed-in person's own data.
export const PATCH = withAccount(patch);
export const DELETE = withAccount(remove);
