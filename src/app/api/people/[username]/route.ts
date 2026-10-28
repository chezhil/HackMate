import { getMember } from "@/lib/auth";

export async function GET(_req: Request, ctx: RouteContext<"/api/people/[username]">) {
  const { username } = await ctx.params;
  const member = getMember(decodeURIComponent(username));
  if (!member) return Response.json({ error: "No one has that username" }, { status: 404 });
  return Response.json({ member });
}
