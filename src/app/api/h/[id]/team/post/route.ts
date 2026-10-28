import { withAccount } from "@/lib/auth";
import { getHackathon } from "@/lib/repo";
import { badRequest, readJson, text, validFields } from "@/lib/validation";
import { draftTeammatePost, type PostInput } from "@/lib/team";

type Ctx = { params: Promise<{ id: string }> };

/** Draft a "looking for teammates" post. Body: { lookingFor, aboutMe, idea } */
async function post(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  if (!getHackathon(id)) return Response.json({ error: "Unknown hackathon" }, { status: 404 });
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  if (!validFields(raw, { lookingFor: text, aboutMe: text, idea: text })) return badRequest("Invalid teammate post fields");
  const body = raw as Partial<PostInput>;
  const input = {
    lookingFor: body.lookingFor?.slice(0, 300) ?? "",
    aboutMe: body.aboutMe?.slice(0, 300) ?? "",
    idea: body.idea?.slice(0, 300) ?? "",
  };
  return Response.json(await draftTeammatePost(id, input));
}

// Every request reads and writes the signed-in person's own data.
export const POST = withAccount(post);
