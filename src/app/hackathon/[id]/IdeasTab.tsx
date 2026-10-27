"use client";

import { Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Banner, ScoreBadge } from "@/components/ui/Feedback";
import { scoreTone } from "@/components/ui/tone";
import { useConfirm } from "@/components/ui/Confirm";
import { call, hid } from "@/lib/client";
import { relative } from "@/lib/format";
import type { Idea, IdeaSuggestion, IdeaVersion, WinnerProject } from "@/lib/types";

interface Suggestions {
  guidelines: string[];
  ideas: IdeaSuggestion[];
}


export function IdeasTab({ id }: { id: string }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [winners, setWinners] = useState<WinnerProject[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [interests, setInterests] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", text: "" });

  useEffect(() => {
    call<{ ideas: Idea[] }>(`/api/h/${hid(id)}/ideas`).then((d) => setIdeas(d.ideas), () => {});
    call<{ projects: WinnerProject[] }>(`/api/h/${hid(id)}/winners`).then((d) => setWinners(d.projects), () => setWinners([]));
  }, [id]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const suggest = () =>
    run("suggest", async () => {
      setSuggestions(await call<Suggestions>(`/api/h/${hid(id)}/ideas`, "POST", { action: "suggest", interests }));
    });

  const create = (title: string, text: string, critique: boolean) =>
    run("create", async () => {
      const d = await call<{ ideas: Idea[] }>(`/api/h/${hid(id)}/ideas`, "POST", { action: "create", title, text });
      setIdeas(d.ideas);
      setDraft({ title: "", text: "" });
      if (critique) {
        const created = d.ideas[0];
        const r = await call<{ idea: Idea }>(`/api/ideas/${created.id}`, "POST", { text });
        setIdeas((list) => list.map((i) => (i.id === created.id ? r.idea : i)));
      }
    });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-main-side">
      <div className="space-y-4">
        {error && <Banner tone="danger">{error}</Banner>}

        <section className="card space-y-3 p-4">
          <div>
            <h2 className="font-bold">Get ideas</h2>
            <p className="text-sm text-muted">Based on this hackathon&apos;s tracks, judging criteria and what has won before.</p>
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Your skills / interests (optional), e.g. React, ML, health"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
            />
            <button className="btn btn-primary shrink-0" onClick={suggest} disabled={busy === "suggest"}>
              {busy === "suggest" ? "Thinking…" : suggestions ? "More ideas" : "Suggest ideas"}
            </button>
          </div>
          {suggestions && (
            <div className="space-y-3">
              <div className="rounded-lg bg-accent-soft/60 p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Guidelines for this hackathon</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-sm">
                  {suggestions.guidelines.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {suggestions.ideas.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium">{s.title}</h4>
                      {s.track && <span className="chip shrink-0">{s.track}</span>}
                    </div>
                    <p className="mt-1">{s.pitch}</p>
                    <p className="mt-1 text-xs text-muted">Why it could win: {s.whyItCouldWin}</p>
                    {s.stack.length > 0 && <p className="mt-1 text-xs text-muted">Stack: {s.stack.join(", ")}</p>}
                    <button
                      className="mt-2 text-xs text-accent hover:underline"
                      onClick={() => create(s.title, `${s.pitch}\n\nStack: ${s.stack.join(", ")}`, true)}
                      disabled={Boolean(busy)}
                    >
                      Use this idea → critique it
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card space-y-2 p-4">
          <h2 className="font-bold">Your idea</h2>
          <input className="input" placeholder="Name" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <textarea
            className="input min-h-24"
            placeholder="What are you building, for whom, and how will you demo it?"
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={!draft.text.trim() || Boolean(busy)} onClick={() => create(draft.title, draft.text, true)}>
              {busy === "create" ? "Critiquing…" : "Save & critique"}
            </button>
            <button className="btn" disabled={!draft.text.trim() || Boolean(busy)} onClick={() => create(draft.title, draft.text, false)}>
              Just save
            </button>
          </div>
        </section>

        {ideas.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            onChange={(next) => setIdeas((list) => list.map((i) => (i.id === next.id ? next : i)))}
            onDelete={() => call(`/api/ideas/${idea.id}`, "DELETE").then(() => setIdeas((list) => list.filter((i) => i.id !== idea.id)))}
          />
        ))}
      </div>

      <aside className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide">Past winners</h2>
        <p className="text-xs text-muted">Prize-winning Devfolio projects from earlier editions and similar themes. The AI uses these too.</p>
        {winners === null && Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)}
        {winners?.length === 0 && <p className="text-sm text-muted">No past winners found.</p>}
        {winners?.map((w) => (
          <a key={w.url} href={w.url} target="_blank" rel="noreferrer" className="card block p-3 text-sm hover:border-muted">
            <div className="font-medium">{w.name}</div>
            {w.tagline && <div className="line-clamp-2 text-xs text-muted">{w.tagline}</div>}
            <div className="mt-1 text-xs text-ok"><Trophy aria-hidden className="mr-1 inline size-3 align-[-1px]" />{w.prizes.slice(0, 2).join(", ") || "Winner"}{w.hackathon && <span className="text-muted"> · {w.hackathon}</span>}</div>
          </a>
        ))}
      </aside>
    </div>
  );
}

function IdeaCard({ idea, onChange, onDelete }: { idea: Idea; onChange: (i: Idea) => void; onDelete: () => void }) {
  const confirm = useConfirm();
  const latest = idea.versions.at(-1)!;
  const [text, setText] = useState(latest.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const scored = idea.versions.filter((v) => v.critique);
  const shown = [...idea.versions].reverse().find((v) => v.critique) ?? null;

  const critique = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ idea: Idea }>(`/api/ideas/${idea.id}`, "POST", { text });
      onChange(r.idea);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{idea.title}</h3>
          <p className="text-xs text-muted">
            {idea.versions.length} version{idea.versions.length > 1 ? "s" : ""} · started {relative(idea.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {scored.map((v, i) => (
            <Badge key={v.id} tone={scoreTone(v.critique!.score)} className="tabular-nums" title={`v${i + 1}`}>
              {v.critique!.score}
            </Badge>
          ))}
          <button className="ml-1 text-muted hover:text-danger" title="Delete idea" onClick={async () => (await confirm({ title: "Delete this idea?", body: `"${idea.title}" and all its versions and scores are deleted.`, confirmLabel: "Delete idea" })) && onDelete()}><X aria-hidden className="size-3.5" /><span className="sr-only">Delete idea</span></button>
        </div>
      </div>

      <textarea className="input min-h-24 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className="btn btn-primary btn-sm" onClick={critique} disabled={busy || !text.trim()}>
          {busy ? "Critiquing…" : text !== latest.text || !latest.critique ? "Critique this version" : "Critique again"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      {shown?.critique && <CritiqueView v={shown} />}

      {idea.versions.length > 1 && (
        <div>
          <button className="text-xs text-accent hover:underline" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? "Hide" : "Show"} earlier versions
          </button>
          {showHistory && (
            <ol className="mt-2 space-y-2">
              {idea.versions.slice(0, -1).map((v, i) => (
                <li key={v.id} className="rounded-lg bg-surface-2 p-2 text-xs">
                  <div className="mb-1 font-medium">
                    v{i + 1}{v.critique && ` · ${v.critique.score}/10 · ${v.critique.verdict}`}
                  </div>
                  <p className="whitespace-pre-wrap text-muted">{v.text}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function CritiqueView({ v }: { v: IdeaVersion }) {
  const c = v.critique!;
  const list = (title: string, items: string[], tone: string) =>
    items.length > 0 && (
      <div>
        <h4 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</h4>
        <ul className="list-disc space-y-0.5 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
    );
  return (
    <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center gap-3">
        <ScoreBadge score={c.score} size="lg" />
        <p>{c.verdict}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list("Positives", c.positives, "text-ok")}
        {list("Negatives", c.negatives, "text-danger")}
        {list("Risks", c.risks, "text-warn")}
        {list("To improve", c.suggestions, "text-accent")}
      </div>
      {c.criteriaFit.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Against the judging criteria</h4>
          {c.criteriaFit.map((f, i) => (
            <div key={i} className="grid grid-cols-[120px_1fr] items-center gap-2 text-xs">
              <span className="truncate" title={f.criterion}>{f.criterion}</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${f.score * 10}%` }} />
                </div>
                <span className="w-8 text-right">{f.score}/10</span>
              </div>
              <span />
              <span className="text-muted">{f.note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
