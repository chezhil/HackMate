import { withAccount } from "@/lib/auth";
import { pastWinners } from "@/lib/details";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

async function get(req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  const refresh = new URL(req.url).searchParams.has("refresh");
  try {
    return Response.json({ projects: await pastWinners(id, refresh) });
  } catch (e) {
    return Response.json({ error: (e as Error).message, projects: [] }, { status: 502 });
  }
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
