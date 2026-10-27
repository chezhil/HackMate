import { draftTeammatePost, type PostInput } from "@/lib/team";

type Ctx = { params: Promise<{ id: string }> };

/** Draft a "looking for teammates" post. Body: { lookingFor, aboutMe, idea } */
export async function POST(req: Request, { params }: Ctx) {
  const id = decodeURIComponent((await params).id);
  const body = (await req.json()) as Partial<PostInput>;
  const input = {
    lookingFor: body.lookingFor?.slice(0, 300) ?? "",
    aboutMe: body.aboutMe?.slice(0, 300) ?? "",
    idea: body.idea?.slice(0, 300) ?? "",
  };
  return Response.json(await draftTeammatePost(id, input));
}
