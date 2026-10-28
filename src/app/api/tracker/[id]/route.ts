import { listTracked, untrackHackathon, updateTracked, type TrackedPatch } from "@/lib/repo";
import { RESULT_LABELS, STATUSES } from "@/lib/types";
import { badRequest, nullableText, optionalUrl, readJson, validFields } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, {
    status: (v) => STATUSES.some((s) => s.key === v),
    result: (v) => v === null || (typeof v === "string" && Object.hasOwn(RESULT_LABELS, v)),
    submissionUrl: optionalUrl, resultNotes: nullableText, notes: nullableText,
  })) return badRequest("Invalid tracker fields");
  const patch: TrackedPatch = {};
  for (const key of ["status", "result", "submissionUrl", "resultNotes", "notes"] as const) {
    if (body[key] !== undefined) Object.assign(patch, { [key]: body[key] });
  }
  if (patch.status && !STATUSES.some((s) => s.key === patch.status)) {
    return Response.json({ error: "Bad status" }, { status: 400 });
  }
  if (patch.result && !Object.hasOwn(RESULT_LABELS, patch.result)) {
    return Response.json({ error: "Bad result" }, { status: 400 });
  }
  try {
    updateTracked(id, patch);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  return Response.json({ tracked: listTracked() });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  untrackHackathon(decodeURIComponent((await params).id));
  return Response.json({ tracked: listTracked() });
}
