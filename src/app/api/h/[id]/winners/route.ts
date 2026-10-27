import { pastWinners } from "@/lib/details";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  await connection();
  const id = decodeURIComponent((await params).id);
  const refresh = new URL(req.url).searchParams.has("refresh");
  try {
    return Response.json({ projects: await pastWinners(id, refresh) });
  } catch (e) {
    return Response.json({ error: (e as Error).message, projects: [] }, { status: 502 });
  }
}
