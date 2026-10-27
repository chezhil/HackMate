import { verifySubmission } from "@/lib/submission";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    return Response.json(await verifySubmission(decodeURIComponent((await params).id)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
