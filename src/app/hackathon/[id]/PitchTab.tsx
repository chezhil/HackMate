"use client";

import { Flame, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { ProjectCard } from "@/components/ProjectCard";
import { ScoreBadge } from "@/components/ui/Feedback";
import { call, hid } from "@/lib/client";
import { relative } from "@/lib/format";
import type { AiOutput, DeckRoast, PitchScript, QaTurn, VideoScript } from "@/lib/types";

type Section = "pitch" | "video" | "roast" | "qa";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "pitch", label: "Pitch script" },
  { key: "video", label: "Demo video script" },
  { key: "roast", label: "Deck roaster" },
  { key: "qa", label: "Mock judge Q&A" },
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;


export function PitchTab({ id }: { id: string }) {
  const [section, setSection] = useState<Section>("pitch");
  const [outputs, setOutputs] = useState<AiOutput[]>([]);
  const [videoLimit, setVideoLimit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ outputs: AiOutput[]; videoLimitSec: number | null }>(`/api/h/${hid(id)}/pitch`).then((d) => {
      setOutputs(d.outputs);
      setVideoLimit(d.videoLimitSec);
    });
  }, [id]);

  const generate = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const d = await call<{ outputs: AiOutput[] }>(`/api/h/${hid(id)}/pitch`, "POST", body);
      setOutputs(d.outputs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const latest = <T,>(kind: AiOutput["kind"]) => outputs.filter((o) => o.kind === kind) as AiOutput<T>[];
  const remove = (oid: number) => call(`/api/outputs/${oid}`, "DELETE").then(() => setOutputs((o) => o.filter((x) => x.id !== oid)));

  return (
    <div className="space-y-4">
      <ProjectCard id={id} />
      <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5 text-sm">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex-1 rounded-md px-3 py-1.5 ${section === s.key ? "bg-surface-2 font-medium" : "text-muted hover:text-text"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {section === "pitch" && <PitchSection items={latest<PitchScript>("pitch")} busy={busy} onGenerate={generate} onDelete={remove} />}
      {section === "video" && (
        // keyed on the limit so the length picker starts at it once it's known
        <VideoSection key={videoLimit ?? "none"} items={latest<VideoScript>("video")} limit={videoLimit} busy={busy} onGenerate={generate} onDelete={remove} />
      )}
      {section === "roast" && <RoastSection items={latest<DeckRoast>("roast")} busy={busy} onGenerate={generate} onDelete={remove} />}
      {section === "qa" && <QaSection id={id} />}
    </div>
  );
}

interface SectionProps<T> {
  items: AiOutput<T>[];
  busy: boolean;
  onGenerate: (body: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
}

function History<T>({ items, render, onDelete }: { items: AiOutput<T>[]; render: (o: AiOutput<T>) => React.ReactNode; onDelete: (id: number) => void }) {
  const [shown, setShown] = useState(0);
  const current = items[shown] ?? items[0];
  if (!current) return null;
  return (
    <div className="space-y-2">
      {items.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Versions:
          {items.map((o, i) => (
            <button key={o.id} onClick={() => setShown(i)} className={`chip ${i === shown ? "border-accent text-accent" : ""}`}>
              {relative(o.createdAt)}
            </button>
          ))}
        </div>
      )}
      {render(current)}
      <button className="text-xs text-muted hover:text-danger" onClick={() => { onDelete(current.id); setShown(0); }}>Delete this version</button>
    </div>
  );
}

function PitchSection({ items, busy, onGenerate, onDelete }: SectionProps<PitchScript>) {
  const [minutes, setMinutes] = useState(3);
  const [audience, setAudience] = useState("");
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <label>
          <span className="label">Length</span>
          <select className="input w-auto" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[1, 2, 3, 5, 7].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
        <label className="min-w-48 flex-1">
          <span className="label">Audience (optional)</span>
          <input className="input" placeholder="e.g. VCs, sponsor engineers, non-technical judges" value={audience} onChange={(e) => setAudience(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={() => onGenerate({ kind: "pitch", minutes, audience })}>
          {busy ? "Writing…" : items.length ? "Write another" : "Write my pitch"}
        </button>
      </div>
      <History
        items={items}
        onDelete={onDelete}
        render={(o) => {
          const p = o.content;
          const full = p.sections.map((s) => s.text).join("\n\n");
          return (
            <article className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="text-xs text-muted">
                    {mmss(p.sections.reduce((n, s) => n + s.seconds, 0))} · ~{full.split(/\s+/).length} words
                  </p>
                </div>
                <CopyButton text={full} />
              </div>
              <ol className="space-y-3">
                {p.sections.map((s, i) => (
                  <li key={i} className="grid gap-1 sm:grid-cols-[130px_1fr]">
                    <div className="text-xs">
                      <div className="font-medium uppercase tracking-wide text-accent">{s.name}</div>
                      <div className="text-muted">{s.seconds}s</div>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{s.text}</p>
                  </li>
                ))}
              </ol>
              {p.tips.length > 0 && (
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <h4 className="label">Delivery tips</h4>
                  <ul className="list-disc space-y-0.5 pl-5">{p.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              )}
            </article>
          );
        }}
      />
    </div>
  );
}

function VideoSection({ items, limit, busy, onGenerate, onDelete }: SectionProps<VideoScript> & { limit: number | null }) {
  const [seconds, setSeconds] = useState(limit ?? 120);
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <label>
          <span className="label">Video length</span>
          <select className="input w-auto" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            {[...new Set([60, 90, 120, 180, 240, 300, ...(limit ? [limit] : [])])].sort((a, b) => a - b).map((s) => (
              <option key={s} value={s}>{mmss(s)}{s === limit ? " (the limit)" : ""}</option>
            ))}
          </select>
        </label>
        {limit && <p className="text-xs text-warn">This hackathon caps demo videos at {mmss(limit)}.</p>}
        <button className="btn btn-primary ml-auto" disabled={busy} onClick={() => onGenerate({ kind: "video", seconds })}>
          {busy ? "Storyboarding…" : items.length ? "Write another" : "Write video script"}
        </button>
      </div>
      <History
        items={items}
        onDelete={onDelete}
        render={(o) => {
          const v = o.content;
          const narration = v.scenes.map((s) => `[${mmss(s.start)}–${mmss(s.end)}] ${s.voiceover}`).join("\n");
          return (
            <article className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{v.title}</h3>
                  <p className="text-xs text-muted">{mmss(v.totalSeconds)} · {v.scenes.length} scenes</p>
                </div>
                <CopyButton text={narration} label="Copy narration" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr><th className="py-1 pr-3">Time</th><th className="py-1 pr-3">On screen</th><th className="py-1 pr-3">Voiceover</th><th className="py-1">Caption</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border align-top">
                    {v.scenes.map((s, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap py-2 pr-3 font-mono text-xs">{mmss(s.start)}–{mmss(s.end)}</td>
                        <td className="py-2 pr-3">{s.shot}</td>
                        <td className="py-2 pr-3">{s.voiceover}</td>
                        <td className="py-2 text-muted">{s.onScreen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {v.tips.length > 0 && (
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <h4 className="label">Recording tips</h4>
                  <ul className="list-disc space-y-0.5 pl-5">{v.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
                </div>
              )}
            </article>
          );
        }}
      />
    </div>
  );
}

function RoastSection({ items, busy, onGenerate, onDelete }: SectionProps<DeckRoast>) {
  const [script, setScript] = useState("");
  return (
    <div className="space-y-3">
      <div className="card space-y-2 p-4">
        <p className="text-sm text-muted">Paste your pitch script or the text of your slides. The roaster quotes your weak spots and tells you how to fix them.</p>
        <textarea className="input min-h-40 text-sm" placeholder="Slide 1: …" value={script} onChange={(e) => setScript(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !script.trim()} onClick={() => onGenerate({ kind: "roast", script })}>
          {!busy && <Flame aria-hidden className="size-4" />}{busy ? "Roasting…" : "Roast it"}
        </button>
      </div>
      <History
        items={items}
        onDelete={onDelete}
        render={(o) => {
          const r = o.content;
          return (
            <article className="card space-y-4 p-4 text-sm">
              <div className="flex items-center gap-3">
                <ScoreBadge score={r.score} size="lg" />
                <p className="font-medium">{r.verdict}</p>
              </div>
              {r.timing && <p className="flex items-center gap-1 text-xs text-muted"><Timer aria-hidden className="size-3.5" /> {r.timing}</p>}
              <div>
                <h4 className="label text-danger">Weak points</h4>
                <ul className="space-y-2">
                  {r.weakPoints.map((w, i) => (
                    <li key={i} className="rounded-lg border border-border p-2.5">
                      <div className="font-medium">{w.issue}</div>
                      {w.quote && <blockquote className="mt-1 border-l-2 border-danger/50 pl-2 text-xs italic text-muted">“{w.quote}”</blockquote>}
                      <div className="mt-1 text-ok">→ {w.fix}</div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <h4 className="label text-ok">What works</h4>
                  <ul className="list-disc space-y-0.5 pl-5">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div>
                  <h4 className="label text-warn">Missing</h4>
                  <ul className="list-disc space-y-0.5 pl-5">{r.missing.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              </div>
              <div className="rounded-lg bg-accent-soft/60 p-3">
                <div className="flex items-center justify-between">
                  <h4 className="label text-accent">Stronger opening</h4>
                  <CopyButton text={r.rewrittenOpening} />
                </div>
                <p>{r.rewrittenOpening}</p>
              </div>
            </article>
          );
        }}
      />
    </div>
  );
}

function QaSection({ id }: { id: string }) {
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [rounds, setRounds] = useState(5);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ turns: QaTurn[]; rounds: number }>(`/api/h/${hid(id)}/qa`).then((d) => {
      setTurns(d.turns);
      setRounds(d.rounds);
    });
  }, [id]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const d = await call<{ turns: QaTurn[] }>(`/api/h/${hid(id)}/qa`, "POST", body);
      setTurns(d.turns);
      setAnswer("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const session = Math.max(0, ...turns.map((t) => t.session));
  const current = turns.filter((t) => t.session === session);
  const open = current.find((t) => !t.answer);
  const graded = current.filter((t) => t.grade);
  const finished = current.length > 0 && !open;
  const avg = graded.length ? graded.reduce((n, t) => n + t.grade!.score, 0) / graded.length : null;
  const past = [...new Set(turns.map((t) => t.session))].filter((s) => s !== session);

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1 text-sm">
          <h3 className="font-semibold">Mock judging</h3>
          <p className="text-muted">
            {rounds} questions from the judging panel. Each answer is scored, with what you missed and a model answer.
          </p>
        </div>
        {(current.length === 0 || finished) && (
          <button className="btn btn-primary" disabled={busy} onClick={() => post({ action: "start" })}>
            {busy ? "Judges are thinking…" : current.length ? "New round" : "Start Q&A"}
          </button>
        )}
        {finished && avg !== null && (
          <span className="flex items-center gap-2 font-semibold">Round score <ScoreBadge score={Number(avg.toFixed(1))} size="lg" /></span>
        )}
      </div>
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {current.map((t, i) => (
        <article key={t.id} className="card space-y-2 p-4 text-sm">
          <div className="text-xs text-muted">Question {i + 1} of {rounds} · <span className="font-medium text-text">{t.judge}</span></div>
          <p className="font-medium">{t.question}</p>
          {t.answer ? (
            <>
              <div className="rounded-lg bg-surface-2 p-2.5">
                <span className="label">Your answer</span>
                <p className="whitespace-pre-wrap">{t.answer}</p>
              </div>
              {t.grade && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0"><ScoreBadge score={t.grade.score} /></span>
                    <p>{t.grade.feedback}</p>
                  </div>
                  {t.grade.missed.length > 0 && (
                    <div>
                      <span className="label text-warn">You could have said</span>
                      <ul className="list-disc space-y-0.5 pl-5">{t.grade.missed.map((m, j) => <li key={j}>{m}</li>)}</ul>
                    </div>
                  )}
                  <details className="rounded-lg border border-border p-2.5">
                    <summary className="cursor-pointer text-xs font-medium text-accent">Model answer</summary>
                    <p className="mt-1">{t.grade.modelAnswer}</p>
                  </details>
                </div>
              )}
            </>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void post({ action: "answer", turnId: t.id, answer });
              }}
            >
              <textarea className="input min-h-24" placeholder="Answer like you would on stage…" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
              <button className="btn btn-primary" disabled={busy || !answer.trim()}>{busy ? "Judging…" : "Submit answer"}</button>
            </form>
          )}
        </article>
      ))}

      {past.length > 0 && (
        <p className="text-xs text-muted">
          Earlier rounds:{" "}
          {past.map((s) => {
            const g = turns.filter((t) => t.session === s && t.grade);
            return g.length ? `${(g.reduce((n, t) => n + t.grade!.score, 0) / g.length).toFixed(1)}/10` : "unfinished";
          }).join(" · ")}
          {" · "}
          <button className="hover:text-danger" onClick={() => post({ action: "clear" })}>Clear history</button>
        </p>
      )}
    </div>
  );
}
