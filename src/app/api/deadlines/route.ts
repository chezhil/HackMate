import { addDeadline, listTracked } from "@/lib/repo";
import { DEADLINE_LABELS, type DeadlineKind } from "@/lib/types";

/** Add a deadline to a tracked hackathon. Body: { hackathonId, kind, label?, dueAt } */
export async function POST(req: Request) {
  const body = (await req.json()) as { hackathonId: string; kind: DeadlineKind; label?: string; dueAt: string };
  if (!(body.kind in DEADLINE_LABELS) || Number.isNaN(new Date(body.dueAt).getTime())) {
    return Response.json({ error: "Need a valid kind and dueAt" }, { status: 400 });
  }
  if (!listTracked().some((t) => t.hackathonId === body.hackathonId)) {
    return Response.json({ error: "Track the hackathon first" }, { status: 400 });
  }
  addDeadline(body.hackathonId, body.kind, body.label?.trim() ?? "", new Date(body.dueAt).toISOString());
  return Response.json({ tracked: listTracked() });
}
