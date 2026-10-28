import { ping } from "@/lib/db";
import { connection } from "next/server";

/** For the host's health check: the server answers and the database opens. */
export async function GET() {
  await connection();
  try {
    await ping();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
