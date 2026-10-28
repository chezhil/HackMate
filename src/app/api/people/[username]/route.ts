import { getMember, memberActivity, withAccount } from "@/lib/auth";

async function get(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const member = getMember(decodeURIComponent(username));
  if (!member) return Response.json({ error: "No one has that username" }, { status: 404 });
  return Response.json({ member, ...memberActivity(member.username) });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
