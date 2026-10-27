import { CircleCheck, CircleX, Info, LoaderCircle, Star, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { OUTLINE, SOFT, scoreTone, type Tone } from "./tone";

export function Spinner({ className = "" }: { className?: string }) {
  return <LoaderCircle aria-hidden className={`size-4 animate-spin ${className}`} />;
}

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${SOFT[tone]} ${className}`}>{children}</span>;
}

/** Small count next to a nav link or column title. */
export function CountPill({ tone = "accent", children, label }: { tone?: Tone; children: ReactNode; label?: string }) {
  return (
    <span className={`rounded-full px-1.5 text-xs tabular-nums ${SOFT[tone]}`} aria-label={label} title={label}>
      {children}
    </span>
  );
}

export function ScoreBadge({ score, max = 10, size = "sm" }: { score: number; max?: number; size?: "sm" | "lg" }) {
  const tone = scoreTone((score / max) * 10);
  return (
    <span className={`rounded-lg font-semibold tabular-nums ${SOFT[tone]} ${size === "lg" ? "px-2.5 py-1 text-lg" : "px-1.5 py-0.5 text-xs"}`}>
      {Number.isInteger(score) ? score : score.toFixed(1)}/{max}
    </span>
  );
}

export type CheckStatus = "pass" | "warn" | "fail" | "info";

const CHECK: Record<CheckStatus, { tone: Tone; Icon: typeof CircleCheck; word: string }> = {
  pass: { tone: "ok", Icon: CircleCheck, word: "Passed" },
  warn: { tone: "warn", Icon: TriangleAlert, word: "Warning" },
  fail: { tone: "danger", Icon: CircleX, word: "Failed" },
  info: { tone: "neutral", Icon: Info, word: "Note" },
};

/** One result line in the style of a CI check: icon and word carry the status, not just the colour. */
export function CheckRow({ status, label, detail }: { status: CheckStatus; label: string; detail?: ReactNode }) {
  const { tone, Icon, word } = CHECK[status];
  return (
    <li className={`flex gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${OUTLINE[tone]}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="sr-only">{word}: </span>
        <span className="font-medium">{label}</span>
        {detail && <span className="text-text">: {detail}</span>}
      </span>
    </li>
  );
}

/** "2 failing · 1 warning · 8 passing", worst first, coloured by the worst result. */
export function CheckSummary({ statuses }: { statuses: CheckStatus[] }) {
  const n = (s: CheckStatus) => statuses.filter((x) => x === s).length;
  const fail = n("fail");
  const warn = n("warn");
  const pass = n("pass");
  const tone: Tone = fail ? "danger" : warn ? "warn" : "ok";
  const { Icon } = CHECK[fail ? "fail" : warn ? "warn" : "pass"];
  const parts = [fail && `${fail} failing`, warn && `${warn} warning${warn > 1 ? "s" : ""}`, pass && `${pass} passing`].filter(Boolean);
  return (
    <p className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-medium ${OUTLINE[tone]}`} role="status">
      <Icon aria-hidden className="size-4 shrink-0" />
      {parts.length ? parts.join(" · ") : "No checks run yet"}
    </p>
  );
}

const BANNER_ICON: Record<Tone, typeof Info> = { neutral: Info, accent: Info, ok: CircleCheck, warn: TriangleAlert, danger: CircleX };

/** Page-level message. Danger banners interrupt screen readers; the rest wait. */
export function Banner({ tone = "neutral", children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  const Icon = BANNER_ICON[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${OUTLINE[tone]}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function Skeleton({ className = "h-24" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

/** `level` 1 when the empty state is the whole page, so the page still has its h1. */
export function EmptyState({ icon, title, children, action, level = 2 }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="card mx-auto max-w-lg p-10 text-center">
      {icon && <div className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-muted [&>svg]:size-5">{icon}</div>}
      <Heading className="mt-3 text-xl font-semibold">{title}</Heading>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Read-only rating, e.g. a retro's 4 of 5. */
export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-warn" title={`${value} of ${max}`}>
      {Array.from({ length: value }, (_, i) => <Star key={i} aria-hidden className="size-3 fill-current" />)}
      <span className="sr-only">{value} of {max} stars</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}
