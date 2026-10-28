import { withAccount } from "@/lib/auth";
import { addDeadline, listTracked } from "@/lib/repo";
import { DEADLINE_LABELS, type DeadlineKind } from "@/lib/types";
import { badRequest, isDate, readJson, text } from "@/lib/validation";

/** Add a deadline to a tracked hackathon. Body: { hackathonId, kind, label?, dueAt } */
async function post(req: Request) {
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (!text(raw.hackathonId) || !text(raw.kind) || (raw.label !== undefined && !text(raw.label))) return badRequest("Invalid deadline fields");
  const body = raw as { hackathonId: string; kind: DeadlineKind; label?: string; dueAt: string };
  if (!Object.hasOwn(DEADLINE_LABELS, body.kind) || !isDate(body.dueAt)) {
    return Response.json({ error: "Need a valid kind and dueAt" }, { status: 400 });
  }
  if (!listTracked().some((t) => t.hackathonId === body.hackathonId)) {
    return Response.json({ error: "Track the hackathon first" }, { status: 400 });
  }
  addDeadline(body.hackathonId, body.kind, body.label?.trim() ?? "", new Date(body.dueAt).toISOString());
  return Response.json({ tracked: listTracked() });
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
