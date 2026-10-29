import { decodeParam } from "@/lib/validation";
import { background } from "@/lib/request";
import { withAccount } from "@/lib/auth";
import { aiStatus } from "@/lib/ai";
import { ruleAlerts } from "@/lib/alerts";
import { buildDetails, getDetails, getSourceText, isBuilding, markReading } from "@/lib/details";
import { getHackathon, listTracked } from "@/lib/repo";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

async function payload(id: string) {
  const hackathon = (await getHackathon(id))!;
  return {
    hackathon,
    tracked: (await listTracked()).find((t) => t.hackathonId === id) ?? null,
    details: await getDetails(id),
    building: await isBuilding(id),
    ruleAlerts: ruleAlerts(await getSourceText(id), { min: hackathon.teamMin, max: hackathon.teamMax }),
    ai: await aiStatus(),
  };
}

/**
 * Cached details. On the first visit this starts reading the page + AI extraction in the
 * background (Gemini can take a minute) and returns `building: true`; the client polls.
 */
async function get(_req: Request, { params }: Ctx) {
  await connection();
  const id = decodeParam((await params).id);
  if (!await getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  if (!(await getDetails(id)) && !(await isBuilding(id))) await startReading(id);
  return Response.json(await payload(id));
}

/** Re-read the page and re-run extraction (in the background; poll GET). */
async function post(_req: Request, { params }: Ctx) {
  const id = decodeParam((await params).id);
  if (!await getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  if (!(await isBuilding(id))) await startReading(id);
  return Response.json(await payload(id));
}

/** Mark the read as started before answering, then run it after the response. */
async function startReading(id: string) {
  await markReading(id);
  background("details", () => buildDetails(id));
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
