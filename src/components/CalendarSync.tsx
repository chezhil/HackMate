"use client";

import { useEffect, useState } from "react";
import { call } from "@/lib/client";
import type { Settings } from "@/lib/types";
import { Banner } from "@/components/ui/Feedback";

type Provider = Settings["calendarProvider"];

const PROVIDERS: { key: Provider; label: string }[] = [
  { key: "google", label: "Google" },
  { key: "apple", label: "Apple" },
  { key: "outlook", label: "Outlook" },
  { key: "other", label: "Other" },
];

/**
 * Calendar sync works through a private iCal subscription feed: the calendar app polls it, so
 * anything you pin, move or tick off in HackMate shows up there automatically.
 */
export function CalendarSync() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    call<{ settings: Settings }>("/api/settings").then((data) => {
      setSettings(data.settings);
      setOrigin((process.env.NEXT_PUBLIC_BASE_URL || window.location.origin).replace(/\/+$/, ""));
    }, (e: Error) => setError(e.message));
  }, []);

  if (!settings && error) return <Banner tone="danger">{error}</Banner>;
  if (!settings) return <div className="h-40 skeleton rounded-xl" />;

  const provider = settings.calendarProvider;
  const feed = `${origin}/api/calendar.ics?token=${settings.calendarToken}`;
  const webcal = feed.replace(/^https?:/, "webcal:");
  const isLocal = /\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(origin);

  const choose = async (p: Provider) => {
    setSaving(true);
    setError(null);
    try {
      const data = await call<{ settings: Settings }>("/api/settings", "PUT", { calendarProvider: p });
      setSettings(data.settings);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { setError("Couldn't copy. Select and copy the feed URL below."); }
  };

  return (
    <div className="space-y-3 text-sm">
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="flex rounded-lg border border-border p-0.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            onClick={() => choose(p.key)}
            disabled={saving}
            className={`flex-1 rounded-md px-2 py-1 text-xs ${provider === p.key ? "bg-surface-2 font-medium" : "text-muted"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {provider === "google" && (
        <div className="space-y-2">
          <a className="btn btn-primary w-full" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">
            Subscribe in Google Calendar ↗
          </a>
          <p className="text-xs text-muted">Google refreshes subscribed calendars every few hours.</p>
        </div>
      )}
      {provider === "apple" && (
        <div className="space-y-2">
          <a className="btn btn-primary w-full" href={webcal}>Subscribe in Apple Calendar</a>
          <p className="text-xs text-muted">Opens Calendar on this Mac / iPhone. Set auto-refresh to every 15 minutes or hour.</p>
        </div>
      )}
      {provider === "outlook" && (
        <a
          className="btn btn-primary w-full"
          href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=HackMate`}
          target="_blank"
          rel="noreferrer"
        >
          Subscribe in Outlook ↗
        </a>
      )}
      {provider === "other" && <p className="text-xs text-muted">Add this URL as a subscribed / internet calendar in your calendar app.</p>}

      <div className="flex gap-1.5">
        <input className="input font-mono text-xs" readOnly value={feed} onFocus={(e) => e.target.select()} />
        <button className="btn btn-sm shrink-0" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <a className="text-xs text-accent hover:underline" href={`${feed}&download`}>Download .ics file (one-time import)</a>

      {isLocal && provider !== "apple" && (
        <Banner tone="warn">
          {provider === "google" ? "Google" : provider === "outlook" ? "Outlook" : "Cloud calendars"} can&apos;t reach
          localhost. Deploy HackMate (or tunnel it) and set <code>NEXT_PUBLIC_BASE_URL</code>, or use the one-time .ics
          download for now. Apple Calendar on this Mac works locally.
        </Banner>
      )}
    </div>
  );
}
