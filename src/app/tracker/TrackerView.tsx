"use client";

import { ArrowRight, Check, Clock, ExternalLink, GripVertical, Pin, PinOff, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ClashList } from "@/components/ClashList";
import { hid } from "@/lib/client";
import { DeadlineEditor } from "@/components/DeadlineEditor";
import { useHackmate } from "@/components/HackmateProvider";
import { useConfirm } from "@/components/ui/Confirm";
import { Countdown } from "@/components/ui/Countdown";
import { Badge, EmptyState, Kbd } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { SEVERITY_LABEL, SEVERITY_TONE } from "@/components/ClashList";
import { worstSeverity, type Clash } from "@/lib/clashes";
import { fmtDate, fmtRange, place } from "@/lib/format";
import type { ResultKind, TrackedWithHackathon, TrackStatus } from "@/lib/types";
import { SOURCE_LABELS, STATUSES } from "@/lib/types";


function clashesFor(id: string, clashes: Clash[]) {
  return clashes.filter((c) =>
    c.kind === "events"
      ? c.a.id === id || c.b.id === id
      : c.kind === "deadlines"
        ? c.items.some((i) => i.hackathon.id === id)
        : c.owner.id === id || c.during.id === id,
  );
}

/** The board ends at "Expecting results"; once results are in, a hackathon moves to the Results page. */
const COLUMNS = STATUSES.filter((s) => s.key !== "results");
const ORDER = COLUMNS.map((s) => s.key);
const labelOf = (s: TrackStatus) => STATUSES.find((x) => x.key === s)!.label;

interface Drag {
  id: string;
  from: TrackStatus;
  title: string;
  meta: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  over: TrackStatus | null;
}

/** Elements that keep their own click behaviour, so pressing on them never starts a drag. */
const INTERACTIVE = "a, button, input, select, textarea, label, summary";

export function TrackerView() {
  const { tracked, clashes, resolvedClashes, loading, updateTracked } = useHackmate();
  const toast = useToast();
  // Moves show at once; the server's answer replaces this when it arrives.
  const [optimistic, setOptimistic] = useState<Record<string, TrackStatus>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragRef = useRef<Drag | null>(null);
  const press = useRef<{ id: string; x: number; y: number; el: HTMLElement; from: TrackStatus; title: string; meta: string } | null>(null);

  const statusOf = (t: TrackedWithHackathon) => optimistic[t.hackathonId] ?? t.status;

  const moveTo = async (t: TrackedWithHackathon, to: TrackStatus, opts: { undoable?: boolean; refocus?: boolean; force?: boolean } = {}) => {
    const from = statusOf(t);
    // Undo passes force: its copy of `t` is from before the move, so its status already looks like the target.
    if (to === from && !opts.force) return;
    setOptimistic((o) => ({ ...o, [t.hackathonId]: to }));
    setAnnounce(`Moved ${t.hackathon.title} to ${labelOf(to)}`);
    if (opts.refocus) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip="${CSS.escape(t.hackathonId)}"]`)?.focus());
    if (opts.undoable !== false) {
      // Brief on purpose: the card moving is the main feedback; the toast is a quick confirmation with Undo.
      toast({ message: `Moved to ${labelOf(to)}`, tone: "info", duration: 1000, undo: () => void moveRef.current(t, from, { undoable: false, force: true }) });
    }
    try {
      await updateTracked(t.hackathonId, { status: to });
    } finally {
      setOptimistic((o) => {
        const next = { ...o };
        delete next[t.hackathonId];
        return next;
      });
    }
  };

  // Pointer drag: works for mouse, pen and touch. Mouse can grab the whole card; touch uses the grip so the page still scrolls.
  const onPointerDown = (e: React.PointerEvent<HTMLElement>, t: TrackedWithHackathon) => {
    if (e.button !== 0) return;
    const fromGrip = (e.target as HTMLElement).closest("[data-grip]");
    if (!fromGrip && (e.pointerType !== "mouse" || (e.target as HTMLElement).closest(INTERACTIVE))) return;
    const el = e.currentTarget;
    press.current = { id: t.hackathonId, x: e.clientX, y: e.clientY, el, from: statusOf(t), title: t.hackathon.title, meta: `${fmtRange(t.hackathon)} · ${place(t.hackathon)}` };
  };

  // The window listeners below are set once; these refs let them see the latest data and move function.
  const trackedRef = useRef(tracked);
  const moveRef = useRef(moveTo);
  useEffect(() => {
    trackedRef.current = tracked;
    moveRef.current = moveTo;
  });

  useEffect(() => {
    const columnAt = (x: number, y: number) =>
      ((document.elementFromPoint(x, y)?.closest("[data-status]") as HTMLElement | null)?.dataset.status as TrackStatus | undefined) ?? null;
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!dragRef.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return;
        const r = p.el.getBoundingClientRect();
        dragRef.current = { id: p.id, from: p.from, title: p.title, meta: p.meta, x: e.clientX, y: e.clientY, dx: p.x - r.left, dy: p.y - r.top, width: r.width, over: null };
        document.body.style.userSelect = "none";
      }
      e.preventDefault();
      dragRef.current = { ...dragRef.current, x: e.clientX, y: e.clientY, over: columnAt(e.clientX, e.clientY) };
      setDrag(dragRef.current);
    };
    const end = (drop: boolean) => {
      const d = dragRef.current;
      press.current = null;
      dragRef.current = null;
      document.body.style.userSelect = "";
      setDrag(null);
      if (drop && d?.over && d.over !== d.from) {
        const t = trackedRef.current.find((x) => x.hackathonId === d.id);
        if (t) void moveRef.current(t, d.over);
      }
    };
    const onUp = () => end(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dragRef.current && end(false);
    window.addEventListener("pointermove", onMove, { passive: false });
    const onCancel = () => end(false);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const withResults = tracked.filter((t) => statusOf(t) === "results").length;
  const onBoard = tracked.length - withResults;

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
        <h1 className="page-title">Tracker</h1>
        <p className="text-sm text-muted">Move each hackathon along as you register, build, submit and hear back.</p>
      </div>
      {(clashes.length > 0 || resolvedClashes.length > 0) && (
        <section className="card p-3">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Clashes</h2>
          <ClashList clashes={clashes} />
        </section>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="hidden text-xs text-muted md:block">
          Drag a card to another column, or focus its <GripVertical aria-hidden className="inline size-3.5" /> handle and press <Kbd>←</Kbd> <Kbd>→</Kbd>.
        </p>
        {withResults > 0 && (
          <Link href="/results" className="btn btn-sm">
            {withResults} with results <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>
      {onBoard === 0 && (
        <EmptyState icon={<Pin />} title="Nothing in progress" action={<Link href="/" className="btn btn-primary">Find hackathons</Link>}>
          Everything you&apos;ve tracked has results. See them on the Results page, or pin something new.
        </EmptyState>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((s) => {
          const items = tracked.filter((t) => statusOf(t) === s.key);
          const target = drag && drag.over === s.key && drag.from !== s.key;
          return (
            <section
              key={s.key}
              data-status={s.key}
              aria-label={`${s.label}, ${items.length}`}
              className={`min-w-0 rounded-xl border-(length:--line) p-2 transition-colors duration-(--dur-fast) ${
                target ? "border-accent bg-accent-soft" : drag ? "border-dashed border-border bg-surface-2/60" : "border-transparent bg-surface-2/60"
              }`}
            >
              <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-bold uppercase tracking-wide">
                {s.label}
                <span className="rounded-full border-(length:--line) border-border bg-surface px-1.5 text-xs tabular-nums">{items.length}</span>
              </h2>
              <div className="space-y-2">
                {items.map((t) => (
                  <TrackerCard
                    key={t.hackathonId}
                    t={t}
                    status={statusOf(t)}
                    clashes={clashesFor(t.hackathonId, clashes)}
                    dragging={drag?.id === t.hackathonId}
                    onPointerDown={(e) => onPointerDown(e, t)}
                    onStep={(dir) => {
                      const i = ORDER.indexOf(statusOf(t)) + dir;
                      if (i >= 0 && i < ORDER.length) void moveTo(t, ORDER[i], { refocus: true });
                    }}
                  />
                ))}
                {target && <p className="rounded-lg border-(length:--line) border-dashed border-accent px-1 py-5 text-center text-xs font-semibold text-accent">Drop here</p>}
                {items.length === 0 && !target && <p className="px-1 py-4 text-center text-xs text-muted">{drag ? "Drop here" : "—"}</p>}
              </div>
            </section>
          );
        })}
      </div>

      {/* The tile that follows the pointer while dragging. */}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-(--z-toast) rotate-2 rounded-xl border-(length:--line) border-border bg-surface p-3 text-sm shadow-pop"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
        >
          <div className="font-bold leading-snug">{drag.title}</div>
          <div className="mt-1 text-xs text-muted">{drag.meta}</div>
          <div className="mt-2 text-xs font-semibold text-accent">{drag.over && drag.over !== drag.from ? `→ ${labelOf(drag.over)}` : "Drag to a column"}</div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}

function TrackerCard({
  t,
  status,
  clashes,
  dragging,
  onPointerDown,
  onStep,
}: {
  t: TrackedWithHackathon;
  /** Includes a move that's still saving. */
  status: TrackStatus;
  clashes: Clash[];
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onStep: (dir: -1 | 1) => void;
}) {
  const { updateTracked, untrack, now } = useHackmate();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const h = t.hackathon;
  const next = status === "results" ? undefined : t.deadlines.find((d) => !d.done && new Date(d.dueAt).getTime() > now);
  const toast = useToast();
  const move = async (s: TrackStatus, extra: Parameters<typeof updateTracked>[1] = {}) => {
    await updateTracked(t.hackathonId, { status: s, ...extra });
    // Results leave the board, so say where the card went.
    if (s === "results") toast({ message: `${h.title} moved to Results.`, tone: "info", duration: 3000 });
  };
  const i = ORDER.indexOf(status);
  const worst = worstSeverity(clashes);

  return (
    <article
      onPointerDown={onPointerDown}
      className={`card card-lift space-y-2 p-3 text-sm md:cursor-grab ${dragging ? "border-dashed opacity-40 shadow-none" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/hackathon/${hid(h.id)}`} className="min-w-0 break-words font-bold leading-snug hover:underline">
          {h.title}
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {worst && worst !== "low" && (
            <Badge tone={SEVERITY_TONE[worst]} className="py-1" title={`${SEVERITY_LABEL[worst]} clash`}>
              <TriangleAlert aria-hidden className="size-3" /><span className="sr-only">{SEVERITY_LABEL[worst]} clash</span>
            </Badge>
          )}
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md border-(length:--line) border-border bg-surface text-muted hover:bg-danger-soft hover:text-danger"
            aria-label={`Unpin ${h.title}`}
            title="Unpin"
            onClick={async () => {
              const ok = await confirm({
                title: "Unpin this hackathon?",
                body: `${h.title} leaves your board and calendar, along with its deadlines and notes.`,
                confirmLabel: "Unpin",
              });
              if (ok) void untrack(t.hackathonId);
            }}
          >
            <PinOff aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            data-grip={t.hackathonId}
            className="grid size-7 cursor-grab touch-none place-items-center rounded-md border-(length:--line) border-border bg-surface text-muted hover:bg-warn-soft hover:text-text active:cursor-grabbing"
            aria-label={`Move ${h.title}. Now in ${labelOf(status)}. Use left and right arrow keys to change column.`}
            title="Drag, or use ← → to move"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); onStep(-1); }
              if (e.key === "ArrowRight" && i < ORDER.length - 1) { e.preventDefault(); onStep(1); }
            }}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <div className="text-xs text-muted">
        {fmtRange(h)} · {place(h)} · {SOURCE_LABELS[h.source]}
      </div>

      {next && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs">
          <span className="text-muted">Next:</span> {next.label} <Countdown to={next.dueAt} />
        </div>
      )}

      <StageActions t={t} move={move} />

      {/* Moving between columns is drag-and-drop or ← → on the grip, so there's no status dropdown here. */}
      {/* One line even in the narrow four-column board, so Deadlines is a clock and a count. */}
      <div className="flex items-center gap-1.5 border-t border-border pt-2 whitespace-nowrap">
        <Link href={`/hackathon/${hid(h.id)}`} className="btn btn-sm btn-primary" title="Rules, Ask AI, ideas, pitch and Q&A tools">
          Open <ArrowRight aria-hidden className="size-3.5" />
        </Link>
        {h.url && (
          <a href={h.url} target="_blank" rel="noreferrer" className="btn btn-sm" title={`Open ${h.title} on ${SOURCE_LABELS[h.source]}`}>
            Website <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={open}
          aria-label={open ? "Hide deadlines and notes" : `Deadlines and notes (${t.deadlines.length} deadlines)`}
          title={open ? "Hide deadlines and notes" : "Deadlines and notes"}
          onClick={() => setOpen(!open)}
        >
          <Clock aria-hidden className="size-3.5" />
          {open ? "Hide" : t.deadlines.length}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border pt-2">
          <DeadlineEditor t={t} />
          {clashes.length > 0 && <ClashList clashes={clashes} compact />}
          <Notes t={t} />
          {/* Unpinning is the pin button at the top of the card, so there's no second remove link down here. */}
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
  const h = t.hackathon;

  switch (t.status) {
    case "interested":
      return (
        <div className="flex flex-wrap gap-1.5">
          {h.url && <a href={h.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">Register ↗</a>}
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
      // Results, prizes, certificate and notes are all recorded on the Wrap-up tab; choosing a result there
      // moves the hackathon to the Results page.
      return (
        <div className="space-y-1.5">
          {t.submissionUrl && (
            <a href={t.submissionUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent hover:underline">
              {t.submissionUrl}
            </a>
          )}
          <Link href={`/hackathon/${hid(h.id)}?tab=wrapup`} className="btn btn-primary btn-sm w-full">
            Wrap up <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      );
    case "results":
      // Hackathons with results live on the Results page, not on the board.
      return null;
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
