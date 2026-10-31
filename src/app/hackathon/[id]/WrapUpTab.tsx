"use client";

import { Pin, Save, Sparkles, Star, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { CertificateList, type CertData } from "@/components/CertificateList";
import { useHackmate } from "@/components/HackmateProvider";
import { PrizeList } from "@/components/PrizeList";
import { useToast } from "@/components/ui/Toast";
import { call, hid } from "@/lib/client";
import type { Prize, ResultKind, Retro } from "@/lib/types";
import { RESULT_LABELS } from "@/lib/types";

type Notes = Pick<Retro, "rating" | "wentWell" | "improve" | "lessons">;

/**
 * After the hackathon: what happened, what you won, certificates, and your own retro notes. The result and notes
 * are a draft until you press Save; prizes and certificates save as you add each one.
 */
export function WrapUpTab({ id }: { id: string }) {
  const { tracked, trackedIds, track, updateTracked } = useHackmate();
  const toast = useToast();
  const t = tracked.find((x) => x.hackathonId === id);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [certs, setCerts] = useState<CertData>({ certificates: [], missing: [] });

  // What's saved, and the draft you're editing.
  const [saved, setSaved] = useState<Notes | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  // undefined = not edited, so the saved value (which may load after this tab) shows through.
  const [editedResult, setResult] = useState<ResultKind | null | undefined>(undefined);
  const [editedNotes, setResultNotes] = useState<string | undefined>(undefined);
  const result = editedResult === undefined ? (t?.result ?? null) : editedResult;
  const resultNotes = editedNotes ?? t?.resultNotes ?? "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ prizes: Prize[] }>("/api/prizes").then((d) => setPrizes(d.prizes), (e: Error) => setError(e.message));
    call<CertData>("/api/certificates").then(setCerts, (e: Error) => setError(e.message));
  }, [id, t?.status]);

  useEffect(() => {
    call<{ retro: Retro }>(`/api/h/${hid(id)}/wrapup`).then(({ retro: r }) => {
      const n = { rating: r.rating, wentWell: r.wentWell, improve: r.improve, lessons: r.lessons };
      setSaved(n);
      setNotes(n);
    }, (e: Error) => {
      // Still let you write notes; saving will say if it fails again.
      const blank = { rating: null, wentWell: "", improve: "", lessons: "" };
      setSaved(blank);
      setNotes(blank);
      setError(e.message);
    });
  }, [id]);

  const resultChanged = result !== (t?.result ?? null) || resultNotes !== (t?.resultNotes ?? "");
  const notesChanged = !!notes && !!saved && (Object.keys(notes) as (keyof Notes)[]).some((k) => notes[k] !== saved[k]);
  const dirty = resultChanged || notesChanged;

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (notesChanged && notes) {
        const d = await call<{ retro: Retro }>(`/api/h/${hid(id)}/wrapup`, "PUT", notes);
        const n = { rating: d.retro.rating, wentWell: d.retro.wentWell, improve: d.retro.improve, lessons: d.retro.lessons };
        setSaved(n);
        setNotes(n);
      }
      // A result is what moves it to Results; notes on their own don't.
      if (resultChanged && result) {
        await updateTracked(id, { status: "results", result, resultNotes: resultNotes.trim() || null });
        setResult(undefined);
        setResultNotes(undefined);
      } else if (resultChanged) {
        // Details without a result yet: keep them, but leave it on the Tracker.
        await updateTracked(id, { resultNotes: resultNotes.trim() || null });
        setResultNotes(undefined);
      }
      toast({ message: result && resultChanged && t?.status !== "results" ? "Wrap-up saved. It's in Results now." : "Wrap-up saved.", tone: "info", duration: 2500 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!trackedIds.has(id)) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center text-sm">
        <p>Pin this hackathon to record results, prizes, certificates and notes.</p>
        <button className="btn btn-primary mt-3" onClick={() => track(id)}><Pin aria-hidden className="size-4" /> Pin to tracker</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Result</h2>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your result">
              {(Object.keys(RESULT_LABELS) as ResultKind[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={result === r}
                  onClick={() => setResult(r)}
                  className={`chip ${result === r ? "chip-on" : "hover:text-text"}`}
                >
                  {r === "won" && <Trophy aria-hidden className="size-3" />}
                  {RESULT_LABELS[r]}
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder="Details (track, rank, judges' feedback…)"
              aria-label="Result details"
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
            />
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Prizes</h2>
            <PrizeList prizes={prizes} onChange={setPrizes} hackathonId={id} />
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-bold">Certificates</h2>
            <CertificateList data={certs} onChange={setCerts} hackathonId={id} />
          </section>
        </div>
        {notes ? <RetroEditor id={id} notes={notes} onChange={setNotes} /> : <div className="h-64 skeleton rounded-xl" />}
      </div>

      {/* One save for the result and notes, kept in view while you fill things in. */}
      <div className="card sticky bottom-3 z-10 flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1 text-sm">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : dirty ? (
            <span className="font-semibold">You have unsaved changes.</span>
          ) : (
            <span className="text-muted">All saved.</span>
          )}
          <span className="block text-xs text-muted">
            {!result ? "Pick a result to move it to Results. " : t?.status !== "results" ? "Saving moves it to Results. " : ""}
            Prizes and certificates save as you add them.
          </span>
        </div>
        {dirty && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setResult(undefined);
              setResultNotes(undefined);
              setNotes(saved);
              setError(null);
            }}
          >
            Discard
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!dirty || saving}>
          <Save aria-hidden className="size-4" /> {saving ? "Saving…" : "Save wrap-up"}
        </button>
      </div>
    </div>
  );
}

const PROMPTS: { key: "wentWell" | "improve" | "lessons"; label: string; placeholder: string }[] = [
  { key: "wentWell", label: "What went well", placeholder: "- Shipped the core demo by hour 20" },
  { key: "improve", label: "What to do better", placeholder: "- Lock the idea before midnight" },
  { key: "lessons", label: "Lessons for next time", placeholder: "- Record the demo video early" },
];

function RetroEditor({ id, notes, onChange }: { id: string; notes: Notes; onChange: (n: Notes) => void }) {
  const [drafting, setDrafting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const draft = async () => {
    setDrafting(true);
    setStatus(null);
    try {
      const d = await call<{ draft: Pick<Retro, "wentWell" | "improve" | "lessons"> }>(`/api/h/${hid(id)}/wrapup`, "POST");
      // Keep anything already written; add the draft underneath.
      const merge = (mine: string, ai: string) => (mine.trim() ? `${mine.trim()}\n${ai}` : ai);
      onChange({ ...notes, wentWell: merge(notes.wentWell, d.draft.wentWell), improve: merge(notes.improve, d.draft.improve), lessons: merge(notes.lessons, d.draft.lessons) });
      setStatus("Draft added. Edit it, then save.");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Retro notes</h2>
          <p className="text-sm text-muted">Your own notes on how it went. Draft them from your standups, idea critiques and mock Q&A.</p>
        </div>
        <button className="btn btn-sm" onClick={draft} disabled={drafting}>{!drafting && <Sparkles aria-hidden className="size-3.5" />}{drafting ? "Drafting…" : "Draft from my activity"}</button>
      </div>
      {status && <p className="text-sm text-muted">{status}</p>}
      <div>
        <span className="label">How was it overall?</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`rounded-md p-0.5 ${notes.rating && n <= notes.rating ? "text-warn" : "text-border-strong hover:text-warn"}`}
              onClick={() => onChange({ ...notes, rating: notes.rating === n ? null : n })}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={notes.rating === n}
            >
              <Star aria-hidden className={`size-6 ${notes.rating && n <= notes.rating ? "fill-current" : ""}`} />
            </button>
          ))}
        </div>
      </div>
      {PROMPTS.map((p) => (
        <label key={p.key} className="block">
          <span className="label">{p.label}</span>
          <textarea className="input min-h-24 text-sm" placeholder={p.placeholder} value={notes[p.key]} onChange={(e) => onChange({ ...notes, [p.key]: e.target.value })} />
        </label>
      ))}
    </section>
  );
}
