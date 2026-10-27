"use client";

import { useMemo, useState } from "react";
import { CalendarSync } from "@/components/CalendarSync";
import { ClashList } from "@/components/ClashList";
import { useHackmate } from "@/components/HackmateProvider";
import { clashKeyDays, dayKey, eventDays } from "@/lib/clashes";
import { fmtDateTime, relative, urgency } from "@/lib/format";
import type { Deadline, Hackathon } from "@/lib/types";

interface DayItems {
  events: { h: Hackathon; tracked: boolean }[];
  deadlines: { d: Deadline; h: Hackathon }[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/** Stable colour per tracked hackathon so its bar is recognisable across days. */
const PALETTE = ["#4f46e5", "#0891b2", "#c026d3", "#ea580c", "#16a34a", "#db2777", "#7c3aed", "#0d9488"];

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function googleTemplateLink(d: Deadline, h: Hackathon) {
  const end = new Date(d.dueAt);
  const start = new Date(end.getTime() - 30 * 60_000);
  const f = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `⏰ ${d.label} — ${h.title}`,
    dates: `${f(start)}/${f(end)}`,
    details: h.url,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export function CalendarView() {
  const { hackathons, tracked, clashes, now } = useHackmate();
  const today = new Date(now);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(dayKey(today));

  const colorOf = useMemo(() => {
    const map = new Map(tracked.map((t, i) => [t.hackathonId, PALETTE[i % PALETTE.length]]));
    return (id: string) => map.get(id);
  }, [tracked]);

  const byDay = useMemo(() => {
    const map = new Map<string, DayItems>();
    const get = (k: string) => {
      if (!map.has(k)) map.set(k, { events: [], deadlines: [] });
      return map.get(k)!;
    };
    const trackedIds = new Set(tracked.map((t) => t.hackathonId));
    for (const t of tracked) {
      for (const k of eventDays(t.hackathon)) get(k).events.push({ h: t.hackathon, tracked: true });
      for (const d of t.deadlines) if (!d.done && d.kind !== "start") get(dayKey(d.dueAt)).deadlines.push({ d, h: t.hackathon });
    }
    if (showAll) {
      for (const h of hackathons) {
        if (trackedIds.has(h.id)) continue;
        for (const k of eventDays(h)) get(k).events.push({ h, tracked: false });
      }
    }
    return map;
  }, [tracked, hackathons, showAll]);

  const clashDays = useMemo(() => clashKeyDays(clashes), [clashes]);
  const days = monthGrid(cursor.y, cursor.m);
  const todayKey = dayKey(today);

  const upcoming = tracked
    .filter((t) => t.status !== "results")
    .flatMap((t) => t.deadlines.filter((d) => !d.done && new Date(d.dueAt) > today).map((d) => ({ d, h: t.hackathon })))
    .sort((a, b) => a.d.dueAt.localeCompare(b.d.dueAt));

  const step = (n: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const sel = byDay.get(selected);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{monthFmt.format(new Date(cursor.y, cursor.m, 1))}</h1>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Show all discovered
            </label>
            <button className="btn btn-sm" onClick={() => step(-1)} aria-label="Previous month">←</button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setCursor({ y: today.getFullYear(), m: today.getMonth() });
                setSelected(todayKey);
              }}
            >
              Today
            </button>
            <button className="btn btn-sm" onClick={() => step(1)} aria-label="Next month">→</button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs font-medium text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1.5">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const k = dayKey(d);
              const items = byDay.get(k);
              const inMonth = d.getMonth() === cursor.m;
              const clash = clashDays.has(k);
              const events = items?.events ?? [];
              const deadlines = items?.deadlines ?? [];
              const shown = [...events.filter((e) => e.tracked), ...events.filter((e) => !e.tracked)].slice(0, 3);
              const hidden = events.length - shown.length;
              return (
                <button
                  key={k}
                  onClick={() => setSelected(k)}
                  className={`relative min-h-24 border-b border-r border-border p-1 text-left align-top transition hover:bg-surface-2 ${
                    inMonth ? "" : "opacity-40"
                  } ${selected === k ? "bg-accent-soft/60" : ""} ${clash ? "bg-danger-soft" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                        k === todayKey ? "bg-accent font-semibold text-accent-text" : ""
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {clash && <span className="text-xs text-danger" title="Clash">⚠</span>}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {deadlines.map(({ d: dl, h }) => (
                      <div
                        key={dl.id}
                        className="truncate rounded border border-danger/40 px-1 text-[10px] font-medium leading-4 text-danger"
                        title={`${dl.label} — ${h.title}`}
                      >
                        ⏰ {dl.label.replace(/ (closes|due)$/i, "")}
                      </div>
                    ))}
                    {shown.map(({ h, tracked: isTracked }) => (
                      <div
                        key={h.id}
                        className={`truncate rounded px-1 text-[10px] leading-4 ${isTracked ? "text-white" : "bg-surface-2 text-muted"}`}
                        style={isTracked ? { background: colorOf(h.id) } : undefined}
                        title={h.title}
                      >
                        {h.title}
                      </div>
                    ))}
                    {hidden > 0 && <div className="px-1 text-[10px] text-muted">+{hidden} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <section className="card p-3">
          <h2 className="mb-2 text-sm font-semibold">{dayFmt.format(new Date(selected + "T12:00:00"))}</h2>
          {!sel || (sel.events.length === 0 && sel.deadlines.length === 0) ? (
            <p className="text-sm text-muted">Nothing on this day.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {sel.deadlines.map(({ d, h }) => (
                <li key={`d${d.id}`} className="flex flex-wrap items-center gap-2">
                  <span className="text-danger">⏰ {d.label}</span>
                  <span>{h.title}</span>
                  <span className="text-xs text-muted">{fmtDateTime(d.dueAt)}</span>
                </li>
              ))}
              {sel.events.map(({ h, tracked: isTracked }) => (
                <li key={h.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: isTracked ? colorOf(h.id) : "var(--border)" }} />
                  <a href={h.url} target="_blank" rel="noreferrer" className="hover:underline">{h.title}</a>
                  {!isTracked && <span className="text-xs text-muted">(not tracked)</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card p-3">
          <h2 className="mb-2 text-sm font-semibold">Upcoming deadlines</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">No open deadlines. Pin a hackathon to start tracking its dates.</p>
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 12).map(({ d, h }) => {
                const u = urgency(d.dueAt);
                return (
                  <li key={d.id} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${u === "soon" ? "bg-danger" : u === "near" ? "bg-warn" : "bg-muted"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{d.label}</div>
                      <div className="truncate text-xs text-muted">{h.title}</div>
                      <div className="text-xs">
                        <span className={u === "soon" ? "font-medium text-danger" : u === "near" ? "text-warn" : "text-muted"}>
                          {relative(d.dueAt)}
                        </span>
                        <span className="text-muted"> · {fmtDateTime(d.dueAt)}</span>
                      </div>
                    </div>
                    <a href={googleTemplateLink(d, h)} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-accent" title="Add this one to Google Calendar">
                      +G
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-3">
          <h2 className="mb-2 text-sm font-semibold">Clashes</h2>
          <ClashList clashes={clashes} />
        </section>

        <section className="card p-3">
          <h2 className="mb-2 text-sm font-semibold">Sync to your calendar</h2>
          <CalendarSync />
        </section>
      </aside>
    </div>
  );
}
