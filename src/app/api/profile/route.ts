import { AuthError, currentUser, saveMemberProfile, withAccount } from "@/lib/auth";
import { badRequest, boolean, isHttpUrl, readJson, text, validFields } from "@/lib/validation";
import type { Profile } from "@/lib/types";
import { getProfile, listCertificates, listPrizes, missingCertificates, portfolio, saveProfile, stats } from "@/lib/wrapup";
import { connection } from "next/server";

async function get() {
  await connection();
  const account = await currentUser();
  return Response.json({
    // Signed in, the header shows and edits your account's public profile; otherwise the one kept on this device.
    profile: account?.profile ?? await getProfile(),
    account,
    stats: await stats(),
    portfolio: await portfolio(),
    prizes: await listPrizes(),
    certificates: await listCertificates(),
    missingCertificates: await missingCertificates(),
  });
}

async function put(req: Request) {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  const keys = ["name", "headline", "bio", "location", "github", "linkedin", "website"];
  const skills = (v: unknown) => Array.isArray(v) && v.length <= 30 && v.every((s) => typeof s === "string" && s.length <= 40);
  if (!validFields(body, { ...Object.fromEntries(keys.map((key) => [key, text])), skills, lookingForTeam: boolean })) return badRequest("Invalid profile fields");
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => keys.includes(key))) as Partial<Profile>;
  if (!(await currentUser())) return Response.json({ profile: await saveProfile(patch), account: null });
  // Account profiles are public, so their links must be real web links.
  if (["github", "linkedin", "website"].some((k) => typeof patch[k as keyof Profile] === "string" && patch[k as keyof Profile] !== "" && !isHttpUrl(patch[k as keyof Profile]))) {
    return badRequest("Links need to be full web addresses, starting with https://");
  }
  try {
    const extra = {
      ...(body.skills !== undefined && { skills: [...new Set((body.skills as string[]).map((s) => s.trim()).filter(Boolean))] }),
      ...(body.lookingForTeam !== undefined && { lookingForTeam: body.lookingForTeam as boolean }),
    };
    const account = await saveMemberProfile({ ...patch, ...extra });
    return Response.json({ profile: account.profile, account });
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
export const PUT = withAccount(put);
