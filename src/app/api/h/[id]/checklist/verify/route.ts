import { withAccount } from "@/lib/auth";
import { verifySubmission } from "@/lib/submission";

type Ctx = { params: Promise<{ id: string }> };

async function post(_req: Request, { params }: Ctx) {
  try {
    return Response.json(await verifySubmission(decodeURIComponent((await params).id)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
