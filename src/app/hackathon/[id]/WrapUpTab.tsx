"use client";

import { useEffect, useState } from "react";
import { CertificateList, type CertData } from "@/components/CertificateList";
import { useHackmate } from "@/components/HackmateProvider";
import { PrizeList } from "@/components/PrizeList";
import { call, hid } from "@/lib/client";
import type { Prize, ResultKind, Retro } from "@/lib/types";
import { RESULT_LABELS } from "@/lib/types";

/** After the hackathon: what happened, what you won, certificates, and your own retro notes. */
export function WrapUpTab({ id }: { id: string }) {
  const { tracked, trackedIds, track, updateTracked } = useHackmate();
  const t = tracked.find((x) => x.hackathonId === id);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [certs, setCerts] = useState<CertData>({ certificates: [], missing: [] });

  useEffect(() => {
    call<{ prizes: Prize[] }>("/api/prizes").then((d) => setPrizes(d.prizes));
    call<CertData>("/api/certificates").then(setCerts);
  }, [id, t?.status]);

  if (!trackedIds.has(id)) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center text-sm">
        <p>Pin this hackathon to record results, prizes, certificates and notes.</p>
        <button className="btn btn-primary mt-3" onClick={() => track(id)}>📌 Pin to tracker</button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Result</h2>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(RESULT_LABELS) as ResultKind[]).map((r) => (
              <button
                key={r}
                onClick={() => updateTracked(id, { status: "results", result: r })}
                className={`chip ${t?.result === r ? "chip-on" : "hover:text-text"}`}
              >
                {r === "won" ? "🏆 " : ""}{RESULT_LABELS[r]}
              </button>
            ))}
          </div>
          <input
            key={t?.resultNotes ?? ""}
            className="input"
            placeholder="Details (track, rank, judges' feedback…)"
            defaultValue={t?.resultNotes ?? ""}
            onBlur={(e) => e.target.value !== (t?.resultNotes ?? "") && updateTracked(id, { status: "results", result: t?.result ?? "participated", resultNotes: e.target.value })}
          />
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Prizes</h2>
          <PrizeList prizes={prizes} onChange={setPrizes} hackathonId={id} />
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="font-semibold">Certificates</h2>
          <CertificateList data={certs} onChange={setCerts} hackathonId={id} />
        </section>
      </div>
      <RetroEditor id={id} />
    </div>
  );
}

const PROMPTS: { key: "wentWell" | "improve" | "lessons"; label: string; placeholder: string }[] = [
  { key: "wentWell", label: "What went well", placeholder: "- Shipped the core demo by hour 20" },
  { key: "improve", label: "What to do better", placeholder: "- Lock the idea before midnight" },
  { key: "lessons", label: "Lessons for next time", placeholder: "- Record the demo video early" },
];

function RetroEditor({ id }: { id: string }) {
  const [retro, setRetro] = useState<Retro | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    call<{ retro: Retro }>(`/api/h/${hid(id)}/wrapup`).then((d) => setRetro(d.retro));
  }, [id]);

  if (!retro) return <div className="h-64 animate-pulse rounded-xl bg-surface-2" />;

  const save = async (next: Retro) => {
    const d = await call<{ retro: Retro }>(`/api/h/${hid(id)}/wrapup`, "PUT", next);
    setRetro(d.retro);
    setStatus("Saved");
    setTimeout(() => setStatus(null), 1500);
  };

  const draft = async () => {
    setDrafting(true);
    setStatus(null);
    try {
      const d = await call<{ draft: Pick<Retro, "wentWell" | "improve" | "lessons"> }>(`/api/h/${hid(id)}/wrapup`, "POST");
      // Keep anything already written; add the draft underneath.
      const merge = (mine: string, ai: string) => (mine.trim() ? `${mine.trim()}\n${ai}` : ai);
      setRetro({ ...retro, wentWell: merge(retro.wentWell, d.draft.wentWell), improve: merge(retro.improve, d.draft.improve), lessons: merge(retro.lessons, d.draft.lessons) });
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
          <h2 className="font-semibold">Retro notes</h2>
          <p className="text-sm text-muted">Your own notes on how it went. Draft them from your standups, idea critiques and mock Q&A.</p>
        </div>
        <button className="btn btn-sm" onClick={draft} disabled={drafting}>{drafting ? "Drafting…" : "✨ Draft from my activity"}</button>
      </div>
      <div>
        <span className="label">How was it overall?</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={`text-2xl ${retro.rating && n <= retro.rating ? "" : "opacity-25 grayscale"}`} onClick={() => save({ ...retro, rating: n })} aria-label={`${n} stars`}>
              ⭐
            </button>
          ))}
        </div>
      </div>
      {PROMPTS.map((p) => (
        <label key={p.key} className="block">
          <span className="label">{p.label}</span>
          <textarea className="input min-h-24 text-sm" placeholder={p.placeholder} value={retro[p.key]} onChange={(e) => setRetro({ ...retro, [p.key]: e.target.value })} />
        </label>
      ))}
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" onClick={() => save(retro)}>Save notes</button>
        {status && <span className="text-sm text-muted">{status}</span>}
      </div>
    </section>
  );
}
