import { badRequest, readJson, text, validFields } from "@/lib/validation";
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
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const keys = ["name", "headline", "bio", "location", "github", "linkedin", "website"];
  if (!validFields(body, Object.fromEntries(keys.map((key) => [key, text])))) return badRequest("Invalid profile fields");
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => keys.includes(key))) as Partial<Profile>;
  return Response.json({ profile: saveProfile(patch) });
}
