import { withAccount } from "@/lib/auth";
import { listTracked, untrackHackathon, updateTracked, type TrackedPatch } from "@/lib/repo";
import { badRequest, isResultKind, isTrackStatus, nullableText, optionalUrl, readJson, validFields, decodeParam } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function patch(req: Request, { params }: Ctx) {
  const id = decodeParam((await params).id);
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!validFields(body, {
    status: isTrackStatus,
    result: (v) => v === null || isResultKind(v),
    submissionUrl: optionalUrl, resultNotes: nullableText, notes: nullableText,
  })) return badRequest("Invalid tracker fields");
  const patch: TrackedPatch = {};
  for (const key of ["status", "result", "submissionUrl", "resultNotes", "notes"] as const) {
    if (body[key] !== undefined) Object.assign(patch, { [key]: body[key] });
  }
  try {
    await updateTracked(id, patch);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  return Response.json({ tracked: await listTracked() });
}

async function remove(_req: Request, { params }: Ctx) {
  await untrackHackathon(decodeParam((await params).id));
  return Response.json({ tracked: await listTracked() });
}

// Every request reads and writes the signed-in person's own data.
export const PATCH = withAccount(patch);
export const DELETE = withAccount(remove);
