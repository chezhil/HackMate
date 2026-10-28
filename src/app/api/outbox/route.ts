import { withAccount } from "@/lib/auth";
import { recentEmails } from "@/lib/mailer";
import { connection } from "next/server";

async function get() {
  await connection();
  return Response.json({ emails: recentEmails() });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
