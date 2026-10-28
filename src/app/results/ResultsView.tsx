"use client";

import { ArrowRight, Award, ChevronRight, Inbox, Link2, PinOff, Search, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AddHackathonDialog } from "@/components/AddHackathonDialog";
import { useHackmate } from "@/components/HackmateProvider";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, Banner, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { ChipToggle } from "@/components/ui/Form";
import type { Tone } from "@/components/ui/tone";
import { call, hid } from "@/lib/client";
import { fmtDate, fmtRange } from "@/lib/format";
import type { Certificate, Prize, ResultKind, TrackedWithHackathon } from "@/lib/types";
import { RESULT_LABELS } from "@/lib/types";
import { formatMoney, wrapUpState } from "@/lib/wrapupState";

export const RESULT_TONE: Record<ResultKind, Tone> = {
  won: "ok",
  runner_up: "ok",
  special_mention: "accent",
  participated: "neutral",
  not_selected: "neutral",
};

type Outcome = "all" | "placed" | "participated";
const OUTCOMES: { key: Outcome; label: string; match: (r: ResultKind | null) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "placed", label: "Won or placed", match: (r) => r === "won" || r === "runner_up" || r === "special_mention" },
  { key: "participated", label: "Took part", match: (r) => r === "participated" || r === "not_selected" },
];

const endOf = (t: TrackedWithHackathon) => new Date(t.hackathon.endsAt ?? t.hackathon.startsAt ?? t.pinnedAt).getTime();

/** Paid cash per hackathon, e.g. "₹50,000" or "₹50,000 + $200". */
function paidTotal(prizes: Prize[]) {
  const byCur = new Map<string, number>();
  for (const p of prizes) if (p.status === "paid" && p.amount != null) byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + p.amount);
  return [...byCur].map(([c, n]) => formatMoney(n, c)).join(" + ");
}

function ResultBadge({ result }: { result: ResultKind | null }) {
  if (!result) return <Badge tone="warn">No result yet</Badge>;
  return (
    <Badge tone={RESULT_TONE[result]}>
      {result === "won" && <Trophy aria-hidden className="size-3" />}
      {RESULT_LABELS[result]}
    </Badge>
  );
}

export function ResultsView() {
  const { tracked, loading, untrack } = useHackmate();
  const confirm = useConfirm();

  // Results have left the Tracker, so this is where you take one off your list for good.
  const remove = async (t: TrackedWithHackathon) => {
    const ok = await confirm({
      title: "Remove this hackathon?",
      body: `${t.hackathon.title} leaves Results, along with its result, deadlines and notes. Prizes and certificates stay in your Profile.`,
      confirmLabel: "Remove",
    });
    if (ok) await untrack(t.hackathonId);
  };
  const [prizes, setPrizes] = useState<Prize[] | null>(null);
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    Promise.all([call<{ prizes: Prize[] }>("/api/prizes"), call<{ certificates: Certificate[] }>("/api/certificates")]).then(
      ([p, c]) => {
        setPrizes(p.prizes);
        setCerts(c.certificates);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  const { wrapping, archive } = useMemo(() => {
    const done = tracked.filter((t) => t.status === "results").sort((a, b) => endOf(b) - endOf(a));
    if (!prizes || !certs) return { wrapping: [], archive: [] };
    const withState = done.map((t) => ({ t, state: wrapUpState(t, prizes, certs) }));
    return { wrapping: withState.filter((x) => !x.state.resolved), archive: withState.filter((x) => x.state.resolved).map((x) => x.t) };
  }, [tracked, prizes, certs]);

  const shownArchive = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = OUTCOMES.find((o) => o.key === outcome)!.match;
    return archive.filter((t) => match(t.result) && (!needle || `${t.hackathon.title} ${t.hackathon.organizer ?? ""}`.toLowerCase().includes(needle)));
  }, [archive, q, outcome]);

  const years = useMemo(() => {
    const m = new Map<number, TrackedWithHackathon[]>();
    for (const t of shownArchive) {
      const y = new Date(endOf(t)).getFullYear();
      m.set(y, [...(m.get(y) ?? []), t]);
    }
    return [...m].sort((a, b) => b[0] - a[0]);
  }, [shownArchive]);

  const ready = !loading && prizes != null && certs != null;
  const total = wrapping.length + archive.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Results</h1>
          <p className="text-sm text-muted">Hackathons that have announced results. Finish wrapping them up, then they file themselves into the archive.</p>
        </div>
        {/* Past hackathons you took part in but never tracked here, from any site. */}
        <button type="button" className="btn" onClick={() => setAddOpen(true)}>
          <Link2 aria-hidden className="size-4" /> Add a past hackathon
        </button>
      </div>
      <AddHackathonDialog open={addOpen} onClose={() => setAddOpen(false)} defaultStage="results" />
      {error && <Banner tone="danger">{error}</Banner>}

      {!ready && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      )}

      {ready && total === 0 && (
        <EmptyState icon={<Award />} title="No results yet" action={<Link href="/tracker" className="btn btn-primary">Go to Tracker</Link>}>
          When a hackathon announces results, save the result on its Tracker card and it moves here.
        </EmptyState>
      )}

      {ready && wrapping.length > 0 && (
        <section aria-labelledby="wrapping" className="space-y-2">
          <h2 id="wrapping" className="text-sm font-bold uppercase tracking-wide">Wrapping up · {wrapping.length}</h2>
          <p className="text-xs text-muted">Results are in, but something is still open. Once it&apos;s all filled in, it moves to the archive.</p>
          <ul className="grid gap-3 md:grid-cols-2">
            {wrapping.map(({ t, state }) => (
              <li key={t.hackathonId} className="card space-y-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/hackathon/${hid(t.hackathonId)}`} className="min-w-0 break-words font-bold leading-snug hover:underline">
                    {t.hackathon.title}
                  </Link>
                  <ResultBadge result={t.result} />
                </div>
                <p className="text-xs text-muted">{fmtRange(t.hackathon)}</p>
                <ul className="space-y-1">
                  {state.open.map((o) => (
                    <li key={o.text} className={`flex items-center gap-1.5 text-xs ${o.urgent ? "font-semibold text-danger" : "text-text"}`}>
                      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${o.urgent ? "bg-danger" : "bg-warn"}`} />
                      {o.text}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/hackathon/${hid(t.hackathonId)}?tab=wrapup`} className="btn btn-sm btn-primary">
                    Wrap up <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                  <button type="button" className="btn btn-sm" onClick={() => remove(t)}>
                    <PinOff aria-hidden className="size-3.5" /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready && archive.length > 0 && (
        <section aria-labelledby="archive" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="archive" className="text-sm font-bold uppercase tracking-wide">Archive · {archive.length}</h2>
              <p className="text-xs text-muted">Fully wrapped up: result recorded, prizes paid, certificates in.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <span className="sr-only">Search the archive</span>
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input className="input w-56 pl-8" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              {OUTCOMES.map((o) => (
                <ChipToggle key={o.key} on={outcome === o.key} onClick={() => setOutcome(o.key)}>{o.label}</ChipToggle>
              ))}
            </div>
          </div>

          {years.length === 0 && (
            <EmptyState icon={<Inbox />} title="Nothing matches">Try another search or filter.</EmptyState>
          )}
          {years.map(([year, items], i) => {
            const wins = items.filter((t) => t.result === "won").length;
            const money = paidTotal(prizes!.filter((p) => items.some((t) => t.hackathonId === p.hackathonId)));
            return (
              // Only the latest year starts open, so a long history stays one line per year.
              <details key={year} open={i === 0 || q.trim().length > 0} className="card group overflow-hidden">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
                  <span className="text-lg font-bold tabular-nums">{year}</span>
                  <span className="text-sm text-muted">
                    {items.length} hackathon{items.length > 1 ? "s" : ""}
                    {wins > 0 && ` · ${wins} win${wins > 1 ? "s" : ""}`}
                    {money && ` · ${money} paid`}
                  </span>
                </summary>
                <ul className="divide-y divide-border border-t-(length:--line) border-border">
                  {items.map((t) => {
                    const paid = paidTotal(prizes!.filter((p) => p.hackathonId === t.hackathonId));
                    const cert = certs!.some((c) => c.hackathonId === t.hackathonId && c.status === "received");
                    return (
                      <li key={t.hackathonId} className="group flex items-center">
                        <Link
                          href={`/hackathon/${hid(t.hackathonId)}?tab=wrapup`}
                          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1 truncate font-semibold">{t.hackathon.title}</span>
                          <span className="text-xs text-muted tabular-nums">{fmtDate(new Date(endOf(t)).toISOString())}</span>
                          <ResultBadge result={t.result} />
                          {paid && <span className="text-xs font-semibold text-ok">{paid}</span>}
                          {cert && <span title="Certificate received"><Award aria-hidden className="size-4 text-accent" /><span className="sr-only">Certificate received</span></span>}
                        </Link>
                        <button
                          type="button"
                          className="mr-2 grid size-7 shrink-0 place-items-center rounded-md text-muted opacity-0 hover:bg-danger-soft hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                          title="Remove"
                          onClick={() => remove(t)}
                        >
                          <PinOff aria-hidden className="size-4" /><span className="sr-only">Remove {t.hackathon.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}
