import { withAccount } from "@/lib/auth";
import { standupAudio } from "@/lib/standups";

type Ctx = { params: Promise<{ standupId: string }> };

async function get(_req: Request, { params }: Ctx) {
  const audio = standupAudio(Number((await params).standupId));
  if (!audio) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(audio.data), {
    headers: { "Content-Type": audio.mime, "Cache-Control": "private, max-age=86400" },
  });
}

// Every request reads and writes the signed-in person's own data.
export const GET = withAccount(get);
