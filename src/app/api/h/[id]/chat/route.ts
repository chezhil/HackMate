import { AiUnavailableError } from "@/lib/ai";
import { askQuestion, clearChat, listChat } from "@/lib/details";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ messages: listChat(decodeURIComponent((await params).id)) });
}

export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const { question } = (await req.json()) as { question?: string };
  if (!question?.trim()) return Response.json({ error: "Ask a question" }, { status: 400 });
  try {
    return Response.json({ messages: await askQuestion(id, question.trim().slice(0, 2000)) });
  } catch (e) {
    const status = e instanceof AiUnavailableError ? 503 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  clearChat(decodeURIComponent((await params).id));
  return Response.json({ messages: [] });
}
