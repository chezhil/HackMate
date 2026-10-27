"use client";

import { useEffect, useRef, useState } from "react";
import { call, hid } from "@/lib/client";
import type { ChatMessage } from "@/lib/types";
import type { DetailsPayload } from "./HackathonView";

const STARTERS = [
  "Can I participate solo?",
  "What do I need to submit?",
  "How long can the demo video be?",
  "Who owns the IP of my project?",
  "Who are the judges and what do they look for?",
  "Can I use code I wrote before the event?",
];

/** Very small markdown: **bold**, `code`, and "- " bullets. Enough for chat answers. */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split(/\n{2,}/).map((block, i) => {
        const lines = block.split("\n");
        const inline = (s: string) =>
          s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) =>
            part.startsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part.startsWith("`") ? <code key={j} className="rounded bg-surface-2 px-1 text-xs">{part.slice(1, -1)}</code> : part,
          );
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
        <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Add GROQ_API_KEY or GEMINI_API_KEY to <code>.env.local</code> and restart to ask questions.
        </div>
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
              className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                m.role === "user" ? "bg-accent text-accent-text" : "bg-surface-2"
              }`}
            >
              {m.role === "user" ? m.content : <Rich text={m.content} />}
            </div>
          </div>
        ))}
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
