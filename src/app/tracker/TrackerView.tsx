"use client";

import { Check, Pin, TriangleAlert, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ClashList } from "@/components/ClashList";
import { hid } from "@/lib/client";
import { DeadlineEditor } from "@/components/DeadlineEditor";
import { useHackmate } from "@/components/HackmateProvider";
import { EmptyState } from "@/components/ui/Feedback";
import type { Clash } from "@/lib/clashes";
import { fmtDate, fmtRange, place, relative } from "@/lib/format";
import type { ResultKind, TrackedWithHackathon, TrackStatus } from "@/lib/types";
import { RESULT_LABELS, SOURCE_LABELS, STATUSES } from "@/lib/types";

const RESULT_STYLE: Record<ResultKind, string> = {
  won: "bg-ok-soft text-ok",
  runner_up: "bg-ok-soft text-ok",
  special_mention: "bg-accent-soft text-accent",
  participated: "bg-surface-2 text-muted",
  not_selected: "bg-surface-2 text-muted",
};

function clashesFor(id: string, clashes: Clash[]) {
  return clashes.filter((c) =>
    c.kind === "events"
      ? c.a.id === id || c.b.id === id
      : c.kind === "deadlines"
        ? c.items.some((i) => i.hackathon.id === id)
        : c.owner.id === id || c.during.id === id,
  );
}

export function TrackerView() {
  const { tracked, clashes, loading } = useHackmate();

  if (!loading && tracked.length === 0) {
    return (
      <EmptyState
        level={1}
        icon={<Pin />}
        title="Nothing tracked yet"
        action={<Link href="/" className="btn btn-primary">Find hackathons</Link>}
      >
        Pin hackathons from Discover to track registration, building, submission and results here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tracker</h1>
        <p className="text-sm text-muted">Move each hackathon along as you register, build, submit and hear back.</p>
      </div>
      {clashes.length > 0 && (
        <section className="card p-3">
          <h2 className="mb-2 text-sm font-semibold">Clashes</h2>
          <ClashList clashes={clashes} />
        </section>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {STATUSES.map((s) => {
          const items = tracked.filter((t) => t.status === s.key);
          return (
            <section key={s.key} className="min-w-0 rounded-xl bg-surface-2/60 p-2">
              <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                {s.label}
                <span className="text-xs font-normal text-muted">{items.length}</span>
              </h2>
              <div className="space-y-2">
                {items.map((t) => (
                  <TrackerCard key={t.hackathonId} t={t} clashes={clashesFor(t.hackathonId, clashes)} />
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">—</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TrackerCard({ t, clashes }: { t: TrackedWithHackathon; clashes: Clash[] }) {
  const { updateTracked, untrack, now } = useHackmate();
  const [open, setOpen] = useState(false);
  const h = t.hackathon;
  const next = t.deadlines.find((d) => !d.done && new Date(d.dueAt).getTime() > now);
  const move = (status: TrackStatus, extra: Parameters<typeof updateTracked>[1] = {}) =>
    updateTracked(t.hackathonId, { status, ...extra });

  return (
    <article className="card space-y-2 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/hackathon/${hid(h.id)}`} className="font-medium leading-snug hover:underline">
          {h.title}
        </Link>
        {clashes.length > 0 && (
          <span className="shrink-0 rounded-md bg-danger-soft px-1.5 py-1 text-danger" title="Has clashes"><TriangleAlert aria-hidden className="size-3" /><span className="sr-only">Has clashes</span></span>
        )}
      </div>
      <div className="text-xs text-muted">
        {fmtRange(h)} · {place(h)} · {SOURCE_LABELS[h.source]}
      </div>

      {next && (
        <div className="rounded-md bg-surface-2 px-2 py-1 text-xs">
          <span className="text-muted">Next:</span> {next.label} <span className="font-medium">{relative(next.dueAt, now)}</span>
        </div>
      )}

      <StageActions t={t} move={move} />

      <div className="flex items-center justify-between gap-2 pt-1">
        <select
          className="input w-auto py-0.5 text-xs"
          value={t.status}
          onChange={(e) => move(e.target.value as TrackStatus)}
          aria-label="Status"
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <button className="text-xs text-accent hover:underline" onClick={() => setOpen(!open)}>
          {open ? "Less" : `Deadlines (${t.deadlines.length})`}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border pt-2">
          <DeadlineEditor t={t} />
          {clashes.length > 0 && <ClashList clashes={clashes} compact />}
          <Notes t={t} />
          <button
            className="text-xs text-danger hover:underline"
            onClick={() => {
              if (confirm(`Stop tracking ${h.title}? Its deadlines and notes will be removed.`)) void untrack(t.hackathonId);
            }}
          >
            Remove from tracker
          </button>
        </div>
      )}
    </article>
  );
}

function StageActions({
  t,
  move,
}: {
  t: TrackedWithHackathon;
  move: (s: TrackStatus, extra?: { submissionUrl?: string | null; result?: ResultKind | null; resultNotes?: string | null }) => Promise<void>;
}) {
  const [url, setUrl] = useState(t.submissionUrl ?? "");
  const [result, setResult] = useState<ResultKind>(t.result ?? "participated");
  const [resultNotes, setResultNotes] = useState(t.resultNotes ?? "");
  const h = t.hackathon;

  switch (t.status) {
    case "interested":
      return (
        <div className="flex flex-wrap gap-1.5">
          <a href={h.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Register ↗</a>
          <button className="btn btn-sm" onClick={() => move("registered")}>I&apos;ve registered</button>
        </div>
      );
    case "registered":
      return (
        <div className="space-y-1">
          {t.registeredAt && <p className="flex items-center gap-1 text-xs text-ok"><Check aria-hidden className="size-3" /> Registered {fmtDate(t.registeredAt)}</p>}
          <button className="btn btn-sm" onClick={() => move("building")}>Start building →</button>
        </div>
      );
    case "building":
      return (
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void move("submitted", { submissionUrl: url.trim() || null });
          }}
        >
          <input className="input py-1 text-xs" placeholder="Project / repo / Devpost link" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-primary btn-sm w-full" type="submit">Mark submitted</button>
        </form>
      );
    case "submitted":
      return (
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void move("results", { result, resultNotes: resultNotes.trim() || null });
          }}
        >
          {t.submissionUrl && (
            <a href={t.submissionUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent hover:underline">
              {t.submissionUrl}
            </a>
          )}
          <select className="input py-1 text-xs" value={result} onChange={(e) => setResult(e.target.value as ResultKind)}>
            {(Object.keys(RESULT_LABELS) as ResultKind[]).map((r) => (
              <option key={r} value={r}>{RESULT_LABELS[r]}</option>
            ))}
          </select>
          <input className="input py-1 text-xs" placeholder="Prize, track, feedback…" value={resultNotes} onChange={(e) => setResultNotes(e.target.value)} />
          <button className="btn btn-sm w-full" type="submit">Save result</button>
        </form>
      );
    case "results":
      return (
        <div className="space-y-1">
          {t.result && <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${RESULT_STYLE[t.result]}`}>{t.result === "won" && <Trophy aria-hidden className="size-3" />}{RESULT_LABELS[t.result]}</span>}
          {t.resultNotes && <p className="text-xs text-muted">{t.resultNotes}</p>}
          {t.submissionUrl && (
            <a href={t.submissionUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent hover:underline">
              {t.submissionUrl}
            </a>
          )}
        </div>
      );
  }
}

function Notes({ t }: { t: TrackedWithHackathon }) {
  const { updateTracked } = useHackmate();
  const [notes, setNotes] = useState(t.notes ?? "");
  return (
    <div>
      <label className="label" htmlFor={`notes-${t.hackathonId}`}>Notes</label>
      <textarea
        id={`notes-${t.hackathonId}`}
        className="input min-h-16 text-xs"
        placeholder="Team, idea, travel plans…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== (t.notes ?? "") && updateTracked(t.hackathonId, { notes })}
      />
    </div>
  );
}
