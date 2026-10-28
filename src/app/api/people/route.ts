import { listMembers } from "@/lib/auth";
import { connection } from "next/server";

/** Everyone who has made an account, with their public profile (never their email). */
export async function GET() {
  await connection();
  return Response.json({ members: listMembers() });
}
