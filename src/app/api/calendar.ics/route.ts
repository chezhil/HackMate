import { calendarToken } from "@/lib/db";
import { trackerCalendar } from "@/lib/ics";
import { listTracked } from "@/lib/repo";
import { getSettings } from "@/lib/settings";

/** Subscription feed of tracked hackathons + deadlines. Guarded by a per-install token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== calendarToken()) {
    return new Response("Not found", { status: 404 });
  }
  const body = trackerCalendar(listTracked(), getSettings().leadMinutes);
  const download = url.searchParams.has("download");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": 'attachment; filename="hackmate.ics"' } : {}),
    },
  });
}
