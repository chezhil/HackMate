import { AiUnavailableError } from "@/lib/ai";
import { answerQa, clearQa, listQa, QA_ROUNDS, startQa } from "@/lib/pitch";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ turns: listQa(decodeURIComponent((await params).id)), rounds: QA_ROUNDS });
}

/** { action: "start" } | { action: "answer", turnId, answer } | { action: "clear" } */
export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const b = (await req.json()) as { action: string; turnId?: number; answer?: string };
  try {
    if (b.action === "start") return Response.json({ turns: await startQa(id), rounds: QA_ROUNDS });
    if (b.action === "answer") {
      if (!b.answer?.trim() || !b.turnId) return Response.json({ error: "Write an answer first" }, { status: 400 });
      return Response.json({ turns: await answerQa(id, b.turnId, b.answer.trim().slice(0, 4000)), rounds: QA_ROUNDS });
    }
    if (b.action === "clear") {
      clearQa(id);
      return Response.json({ turns: [], rounds: QA_ROUNDS });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof AiUnavailableError ? 503 : 500 });
  }
}
