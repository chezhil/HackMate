"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/types";

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

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/settings");
      const data = (await res.json()) as { settings: Settings };
      setSettings(data.settings);
      setOrigin(process.env.NEXT_PUBLIC_BASE_URL || window.location.origin);
    })();
  }, []);

  if (!settings) return <div className="h-40 animate-pulse rounded-xl bg-surface-2" />;

  const provider = settings.calendarProvider;
  const feed = `${origin}/api/calendar.ics?token=${settings.calendarToken}`;
  const webcal = feed.replace(/^https?:/, "webcal:");
  const isLocal = /\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(origin);

  const choose = async (p: Provider) => {
    setSettings({ ...settings, calendarProvider: p });
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarProvider: p }) });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(feed);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex rounded-lg border border-border p-0.5">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            onClick={() => choose(p.key)}
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
        <p className="rounded-lg bg-warn-soft px-2.5 py-2 text-xs text-warn">
          {provider === "google" ? "Google" : provider === "outlook" ? "Outlook" : "Cloud calendars"} can&apos;t reach
          localhost. Deploy HackMate (or tunnel it) and set <code>NEXT_PUBLIC_BASE_URL</code>, or use the one-time .ics
          download for now. Apple Calendar on this Mac works locally.
        </p>
      )}
    </div>
  );
}
