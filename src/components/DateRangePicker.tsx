"use client";

import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { rangeLabel } from "@/app/discoverFilters";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** A local calendar day as YYYY-MM-DD. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Pick dates on a calendar. The first click picks an end date (from today until then); a second click makes a
 * range between the two days; a third starts again. Past days can't be picked.
 */
export function DateRangePicker({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [open, setOpen] = useState(false);
  const today = iso(new Date());
  const [month, setMonth] = useState(() => {
    const d = to ? new Date(`${to}T00:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const wrap = useRef<HTMLDivElement>(null);

  // Clicking outside or pressing Escape closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (d: string) => {
    // One date picked so far (only an end date): this click makes the range between the two.
    if (to && !from && d !== to) onChange(d < to ? d : to, d < to ? to : d);
    else onChange("", d);
  };

  // Monday-first grid with leading days from the previous month.
  const first = (month.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i - first + 1));
  const start = from || today;
  const inRange = (d: string) => !!to && d >= start && d <= to;

  return (
    <div ref={wrap} className="relative">
      <span className="label">Dates</span>
      <div className="flex gap-1">
        <button type="button" className="input flex items-center gap-2 text-left" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
          <CalendarRange aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="truncate">{rangeLabel(from, to)}</span>
        </button>
        {(from || to) && (
          <button type="button" className="btn shrink-0 px-2" aria-label="Clear dates" title="Clear dates" onClick={() => onChange("", "")}>
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {open && (
        <div role="dialog" aria-label="Pick dates" className="card absolute left-0 top-full z-[1100] mt-1 w-72 space-y-2 p-3 shadow-hard">
          <div className="flex items-center justify-between">
            <button type="button" className="btn btn-sm px-2" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <span className="text-sm font-bold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
            <button type="button" className="btn btn-sm px-2" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {WEEKDAYS.map((w) => <span key={w} className="py-1 font-semibold text-muted">{w}</span>)}
            {days.map((d) => {
              const key = iso(d);
              const past = key < today;
              const ends = key === to || key === from;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={past}
                  aria-pressed={ends}
                  aria-label={d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  onClick={() => pick(key)}
                  className={`rounded-md py-1.5 tabular-nums disabled:opacity-30 ${
                    ends ? "bg-accent font-bold text-accent-text" : inRange(key) ? "bg-accent-soft" : "hover:bg-surface-2"
                  } ${d.getMonth() !== month.getMonth() ? "text-muted" : ""} ${key === today && !ends ? "ring-2 ring-inset ring-accent" : ""}`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            {!to ? "Pick a day to see hackathons from today until then." : !from ? "Pick a second day for a range, or Done." : "Shows hackathons inside these dates."}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-sm" onClick={() => onChange("", "")}>Clear</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
