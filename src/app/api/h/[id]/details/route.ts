import { aiStatus } from "@/lib/ai";
import { ruleAlerts } from "@/lib/alerts";
import { buildDetails, getDetails, getSourceText, isBuilding } from "@/lib/details";
import { getHackathon, listTracked } from "@/lib/repo";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

function payload(id: string) {
  const hackathon = getHackathon(id)!;
  return {
    hackathon,
    tracked: listTracked().find((t) => t.hackathonId === id) ?? null,
    details: getDetails(id),
    building: isBuilding(id),
    ruleAlerts: ruleAlerts(getSourceText(id), { min: hackathon.teamMin, max: hackathon.teamMax }),
    ai: aiStatus(),
  };
}

/**
 * Cached details. On the first visit this starts reading the page + AI extraction in the
 * background (Gemini can take a minute) and returns `building: true`; the client polls.
 */
export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  if (!getDetails(id) && !isBuilding(id)) void buildDetails(id).catch((e) => console.error("[details]", e));
  return Response.json(payload(id));
}

/** Re-read the page and re-run extraction (in the background; poll GET). */
export async function POST(_req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  void buildDetails(id).catch((e) => console.error("[details]", e));
  return Response.json(payload(id));
}
