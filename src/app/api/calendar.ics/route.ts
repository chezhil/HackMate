import { allScopes, getSetting, runAs } from "@/lib/db";
import { trackerCalendar } from "@/lib/ics";
import { listTracked } from "@/lib/repo";
import { getSettings } from "@/lib/settings";

/**
 * Subscription feed of tracked hackathons + deadlines. Calendar apps send no cookie, so the secret token in the
 * link says whose tracker it is: each account (and signed out) has its own.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const owner = token ? allScopes().find((id) => runAs(id, () => getSetting("calendarToken")) === token) : undefined;
  if (owner === undefined) {
    return new Response("Not found", { status: 404 });
  }
  const body = runAs(owner, () => trackerCalendar(listTracked(), getSettings().leadMinutes));
  const download = url.searchParams.has("download");
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": 'attachment; filename="hackmate.ics"' } : {}),
    },
  });
}
