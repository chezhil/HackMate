import { decodeParam } from "@/lib/validation";
import { withAccount } from "@/lib/auth";
import { verifySubmission } from "@/lib/submission";

type Ctx = { params: Promise<{ id: string }> };

async function post(_req: Request, { params }: Ctx) {
  return Response.json(await verifySubmission(decodeParam((await params).id)));
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
