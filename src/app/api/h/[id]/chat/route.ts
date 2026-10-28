import { withAccount } from "@/lib/auth";
import { badRequest, readJson } from "@/lib/validation";
import { AiUnavailableError } from "@/lib/ai";
import { askQuestion, clearChat, listChat } from "@/lib/details";
import { connection } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

async function get(_req: Request, { params }: Ctx) {
  await connection();
  return Response.json({ messages: await listChat(decodeURIComponent((await params).id)) });
}

async function post(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const question = body.question;
  if (typeof question !== "string") return badRequest("Ask a question");
  if (!question?.trim()) return Response.json({ error: "Ask a question" }, { status: 400 });
  try {
    return Response.json({ messages: await askQuestion(id, question.trim().slice(0, 2000)) });
  } catch (e) {
    const status = e instanceof AiUnavailableError ? 503 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}

async function remove(_req: Request, { params }: Ctx) {
  await clearChat(decodeURIComponent((await params).id));
  return Response.json({ messages: [] });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const POST = withAccount(post);
export const DELETE = withAccount(remove);
