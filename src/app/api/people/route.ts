import { listMembers, withAccount } from "@/lib/auth";
import { connection } from "next/server";

/** Everyone who has made an account, with their public profile (never their email). */
async function get() {
  await connection();
  return Response.json({ members: listMembers() });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
