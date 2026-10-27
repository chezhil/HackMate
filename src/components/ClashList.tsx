"use client";

import { ChevronRight, CircleCheck, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { isNotable, type Clash, type Severity } from "@/lib/clashes";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Badge } from "./ui/Feedback";
import { OUTLINE, type Tone } from "./ui/tone";

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
    detail: `Due ${fmtDateTime(c.deadline.dueAt)}`,
  };
}

export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Minor" };
export const SEVERITY_TONE: Record<Severity, Tone> = { critical: "danger", high: "danger", medium: "warn", low: "neutral" };
const SEVERITY_ICON = { critical: OctagonAlert, high: TriangleAlert, medium: TriangleAlert, low: Info };

function Row({ c }: { c: Clash }) {
  const { title, detail } = describeClash(c);
  const Icon = SEVERITY_ICON[c.severity];
  return (
    <li className={`rounded-lg border-(length:--line) px-3 py-2 text-sm ${OUTLINE[SEVERITY_TONE[c.severity]]} ${c.severity === "critical" ? "shadow-hard-sm" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5 font-semibold">
        <Icon aria-hidden className="size-4 shrink-0" />
        <Badge tone={SEVERITY_TONE[c.severity]}>{SEVERITY_LABEL[c.severity]}</Badge>
        <span className="min-w-0">{title}</span>
      </div>
      <p className="mt-0.5 text-xs text-text">{c.reason}</p>
      <p className="text-xs text-muted">{detail}</p>
    </li>
  );
}

/**
 * Clashes worst first. Minor ones (long online events overlapping, registrations) are folded into one
 * collapsed group so they don't drown out the ones that need a decision.
 */
export function ClashList({ clashes, compact }: { clashes: Clash[]; compact?: boolean }) {
  const notable = clashes.filter(isNotable);
  const minor = clashes.filter((c) => !isNotable(c));
  if (clashes.length === 0 || (compact && notable.length === 0)) {
    return compact ? null : <p className="flex items-center gap-1.5 text-sm text-muted"><CircleCheck aria-hidden className="size-4 text-ok" /> No clashes. Your schedule is clear.</p>;
  }
  return (
    <div className="space-y-2">
      {notable.length === 0 && (
        <p className="flex items-center gap-1.5 text-sm text-muted"><CircleCheck aria-hidden className="size-4 text-ok" /> Nothing that needs a decision.</p>
      )}
      {notable.length > 0 && <ul className="space-y-2">{notable.map((c, i) => <Row key={i} c={c} />)}</ul>}
      {!compact && minor.length > 0 && (
        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted hover:text-text">
            <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
            {minor.length} minor overlap{minor.length > 1 ? "s" : ""}, like long online events running side by side
          </summary>
          <ul className="mt-2 space-y-2">{minor.map((c, i) => <Row key={i} c={c} />)}</ul>
        </details>
      )}
    </div>
  );
}
