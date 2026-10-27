import { recentEmails } from "@/lib/mailer";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ emails: recentEmails() });
}
