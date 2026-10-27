"use client";

import { BookOpen, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { call, hid } from "@/lib/client";
import { Badge, Banner } from "@/components/ui/Feedback";
import type { ChatMessage, Citation } from "@/lib/types";
import type { DetailsPayload } from "./HackathonView";

const STARTERS = [
  "Can I participate solo?",
  "What do I need to submit?",
  "How long can the demo video be?",
  "Who owns the IP of my project?",
  "Who are the judges and what do they look for?",
  "Can I use code I wrote before the event?",
];

/** The quoted rule behind one [n], or the paragraph it came from when the quote couldn't be matched. */
function CitationBody({ c }: { c: Citation }) {
  const [full, setFull] = useState(false);
  return (
    <>
      {/* Spans only: this renders inside the answer's <p>, where block elements aren't allowed. */}
      <q className="block border-l-2 border-accent pl-2 text-text">{c.quote}</q>
      <span className="mt-1.5 flex items-center gap-1 text-muted">
        {c.verified ? (
          <><ShieldCheck aria-hidden className="size-3.5 text-ok" /> Quoted from the hackathon page</>
        ) : (
          <>From the hackathon page (exact sentence not matched)</>
        )}
      </span>
      {c.passage !== c.quote && (
        <button type="button" className="mt-1 text-accent hover:underline" onClick={() => setFull(!full)} aria-expanded={full}>
          {full ? "Hide full passage" : "Show full passage"}
        </button>
      )}
      {full && <span className="mt-1.5 block whitespace-pre-line rounded-md bg-surface-2 p-2 text-text">{c.passage}</span>}
    </>
  );
}

/** Numbered source marker: opens a popover with the quote. Escape or a click elsewhere closes it. */
function CitationChip({ c }: { c: Citation }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Source ${c.n}`}
        className={`mx-0.5 rounded-md px-1 align-super text-2xs font-semibold tabular-nums ${open ? "bg-accent text-accent-text" : "bg-accent-soft text-accent hover:bg-accent hover:text-accent-text"}`}
      >
        {c.n}
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={`Source ${c.n}`}
          // Anchored under the marker on wide screens; a sheet along the bottom on phones, so it never runs off the edge.
          className="fixed inset-x-4 bottom-4 z-(--z-drawer) block rounded-xl border border-border bg-surface p-3 text-xs shadow-pop sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1 sm:w-80"
        >
          <CitationBody c={c} />
        </span>
      )}
    </span>
  );
}

function Sources({ citations }: { citations: Citation[] }) {
  return (
    <details className="mt-2 border-t border-border pt-2 text-xs">
      <summary className="flex cursor-pointer items-center gap-1 text-muted hover:text-text">
        <BookOpen aria-hidden className="size-3.5" /> {citations.length} source{citations.length > 1 ? "s" : ""} from the rules
      </summary>
      <ol className="mt-2 space-y-2">
        {citations.map((c) => (
          <li key={c.n} className="flex gap-2">
            <span className="mt-0.5 shrink-0 rounded-md bg-accent-soft px-1 text-2xs font-semibold text-accent">{c.n}</span>
            <div className="min-w-0"><CitationBody c={c} /></div>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Very small markdown: **bold**, `code`, "- " bullets and [n] citations. Enough for chat answers. */
function Rich({ text, citations = [] }: { text: string; citations?: Citation[] }) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  return (
    <div className="space-y-1.5">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        const inline = (s: string) =>
          s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g).map((part, j) => {
            if (part.startsWith("**")) return <strong key={j}>{part.slice(2, -2)}</strong>;
            if (part.startsWith("`")) return <code key={j} className="rounded-md bg-surface-2 px-1 text-xs">{part.slice(1, -1)}</code>;
            const c = /^\[(\d+)\]$/.test(part) ? byN.get(Number(part.slice(1, -1))) : undefined;
            return c ? <CitationChip key={j} c={c} /> : part;
          });
        if (lines.every((l) => /^\s*[-*•]\s/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}

export function AskTab({ id, data }: { id: string; data: DetailsPayload }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    call<{ messages: ChatMessage[] }>(`/api/h/${hid(id)}/chat`).then((d) => setMessages(d.messages), () => {});
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

  const ask = async (q: string) => {
    if (!q.trim() || pending) return;
    setPending(q);
    setQuestion("");
    setError(null);
    try {
      const d = await call<{ messages: ChatMessage[] }>(`/api/h/${hid(id)}/chat`, "POST", { question: q });
      setMessages(d.messages);
    } catch (e) {
      setError((e as Error).message);
      setQuestion(q);
    } finally {
      setPending(null);
    }
  };

  const noAi = !data.ai.groq.configured && !data.ai.gemini.configured;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {noAi && (
        <Banner tone="warn">
          Add GROQ_API_KEY or GEMINI_API_KEY to <code>.env.local</code> and restart to ask questions.
        </Banner>
      )}
      <div className="card min-h-[320px] space-y-3 p-4">
        {messages.length === 0 && !pending && (
          <div className="py-6 text-center text-sm text-muted">
            <p>Ask anything about {data.hackathon.title}. Answers come only from its rules and listing.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button key={s} className="chip hover:text-text" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] rounded-2xl border-(length:--line) border-border px-3.5 py-2 text-sm shadow-hard-sm ${
                m.role === "user" ? "bg-accent text-accent-text" : "bg-surface"
              }`}
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <>
                  {m.notFound && <Badge tone="warn" className="mb-1.5">Not in the rules</Badge>}
                  <Rich text={m.content} citations={m.citations} />
                  {m.citations.length > 0 && <Sources citations={m.citations} />}
                </>
              )}
            </div>
          </div>
        ))}
        {!pending && messages.at(-1)?.role === "assistant" && (messages.at(-1)?.followUps.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
            {messages.at(-1)!.followUps.map((q) => (
              <button key={q} type="button" className="chip hover:border-accent hover:text-accent" onClick={() => ask(q)}>{q}</button>
            ))}
          </div>
        )}
        {pending && (
          <>
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-accent px-3.5 py-2 text-sm text-accent-text">{pending}</div>
            </div>
            <div className="w-fit animate-pulse rounded-2xl bg-surface-2 px-3.5 py-2 text-sm text-muted">Reading the rules…</div>
          </>
        )}
        <div ref={bottom} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          className="input"
          placeholder="e.g. Is there a slide limit for the pitch deck?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={noAi}
        />
        <button className="btn btn-primary" disabled={!question.trim() || Boolean(pending) || noAi}>Ask</button>
      </form>
      {messages.length > 0 && (
        <button
          className="text-xs text-muted hover:text-danger"
          onClick={() => call(`/api/h/${hid(id)}/chat`, "DELETE").then(() => setMessages([]))}
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}
