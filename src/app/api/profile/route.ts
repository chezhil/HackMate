import type { Profile } from "@/lib/types";
import { getProfile, listCertificates, listPrizes, missingCertificates, portfolio, saveProfile, stats } from "@/lib/wrapup";
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({
    profile: getProfile(),
    stats: stats(),
    portfolio: portfolio(),
    prizes: listPrizes(),
    certificates: listCertificates(),
    missingCertificates: missingCertificates(),
  });
}

export async function PUT(req: Request) {
  const b = (await req.json()) as Partial<Profile>;
  return Response.json({ profile: saveProfile(b) });
}
