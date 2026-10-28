import { getHackathon } from "@/lib/repo";
import { decodeParam } from "@/lib/validation";
import { withAccount } from "@/lib/auth";
import { pastWinners } from "@/lib/details";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

async function get(req: Request, { params }: Ctx) {
  await connection();
  const id = decodeParam((await params).id);
  const refresh = new URL(req.url).searchParams.has("refresh");
  if (!(await getHackathon(id))) return Response.json({ error: "Unknown hackathon", projects: [] }, { status: 404 });
  try {
    return Response.json({ projects: await pastWinners(id, refresh) });
  } catch (e) {
    // Devfolio's search being down isn't our error: say so, with nothing to show.
    return Response.json({ error: (e as Error).message, projects: [] }, { status: 502 });
  }
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
