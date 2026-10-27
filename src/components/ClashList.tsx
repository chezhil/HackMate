"use client";

import type { Clash } from "@/lib/clashes";
import { fmtDate, fmtDateTime } from "@/lib/format";

export function describeClash(c: Clash): { title: string; detail: string } {
  if (c.kind === "events") {
    const days = c.days.length;
    return {
      title: `${c.a.title} overlaps ${c.b.title}`,
      detail: days ? `Both running on ${days === 1 ? fmtDate(c.days[0]) : `${days} days from ${fmtDate(c.days[0])}`}` : "Dates overlap",
    };
  }
  if (c.kind === "deadlines") {
    return {
      title: `${c.items.length} deadlines on ${fmtDate(c.day)}`,
      detail: c.items.map((i) => `${i.deadline.label} · ${i.hackathon.title}`).join("  •  "),
    };
  }
  return {
    title: `${c.owner.title}: ${c.deadline.label.toLowerCase()} during ${c.during.title}`,
    detail: `Due ${fmtDateTime(c.deadline.dueAt)}, while ${c.during.title} is running`,
  };
}

export function ClashList({ clashes, compact }: { clashes: Clash[]; compact?: boolean }) {
  if (clashes.length === 0) {
    return compact ? null : <p className="text-sm text-muted">No clashes. Your schedule is clear. ✨</p>;
  }
  return (
    <ul className="space-y-2">
      {clashes.map((c, i) => {
        const { title, detail } = describeClash(c);
        return (
          <li key={i} className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm">
            <div className="font-medium text-danger">⚠ {title}</div>
            <div className="text-xs text-muted">{detail}</div>
          </li>
        );
      })}
    </ul>
  );
}
