import { listTracked, untrackHackathon, updateTracked, type TrackedPatch } from "@/lib/repo";
import { RESULT_LABELS, STATUSES } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const patch = (await req.json()) as TrackedPatch;
  if (patch.status && !STATUSES.some((s) => s.key === patch.status)) {
    return Response.json({ error: "Bad status" }, { status: 400 });
  }
  if (patch.result && !(patch.result in RESULT_LABELS)) {
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
