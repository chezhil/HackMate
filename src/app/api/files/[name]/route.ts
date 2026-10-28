import { withAccount } from "@/lib/auth";
import { mimeOf, readFile } from "@/lib/files";

type Ctx = { params: Promise<{ name: string }> };

async function get(_req: Request, { params }: Ctx) {
  const { name } = await params;
  const data = await readFile(name);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": mimeOf(name), "Cache-Control": "private, max-age=86400" },
  });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
