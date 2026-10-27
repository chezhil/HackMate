"use client";

import { Mic, PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { call, hid } from "@/lib/client";
import { useConfirm } from "@/components/ui/Confirm";
import { Badge, Banner } from "@/components/ui/Feedback";
import { Segmented } from "@/components/ui/Tabs";
import { fmtDateTime } from "@/lib/format";
import type { Standup, Teammate } from "@/lib/types";

const MAX_SECONDS = 5 * 60;

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function StandupsTab({ id }: { id: string }) {
  const confirm = useConfirm();
  const [standups, setStandups] = useState<Standup[]>([]);
  const [team, setTeam] = useState<Teammate[]>([]);
  const [author, setAuthor] = useState("Me");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"voice" | "text">("voice");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);

  useEffect(() => {
    call<{ standups: Standup[] }>(`/api/h/${hid(id)}/standups`).then((d) => setStandups(d.standups), () => {});
    call<{ team: Teammate[] }>(`/api/h/${hid(id)}/team`).then((d) => setTeam(d.team), () => {});
  }, [id]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const upload = async (blob: Blob, duration: number) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("audio", blob, "standup");
      form.append("author", author);
      form.append("duration", String(duration));
      const res = await fetch(`/api/h/${hid(id)}/standups`, { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setStandups(d.standups);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const stop = () => {
    recorder.current?.stop();
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const duration = (Date.now() - started.current) / 1000;
        void upload(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }), duration);
      };
      recorder.current = rec;
      started.current = Date.now();
      rec.start();
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => {
        const s = (Date.now() - started.current) / 1000;
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      setError("Microphone access was blocked. Allow it in the browser's site settings to record.");
    }
  };

  const retry = (s: Standup) =>
    call<{ standups: Standup[] }>(`/api/standups/${s.id}/transcribe`, "POST").then((d) => setStandups(d.standups), (e: Error) => setError(e.message));
  const remove = async (s: Standup) =>
    (await confirm(
      s.kind === "text"
        ? { title: "Delete this standup?", body: "The note and its summary are deleted.", confirmLabel: "Delete" }
        : { title: "Delete this voice note?", body: "The recording and its transcript are deleted.", confirmLabel: "Delete" },
    )) &&
    call<{ standups: Standup[] }>(`/api/standups/${s.id}`, "DELETE").then((d) => setStandups(d.standups));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="How to add a standup"
          value={mode}
          onChange={setMode}
          options={[{ key: "voice", label: "Voice" }, { key: "text", label: "Write" }]}
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">From</span>
          <select className="input w-auto" value={author} onChange={(e) => setAuthor(e.target.value)} disabled={recording}>
            <option>Me</option>
            {team.map((t) => <option key={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>

      {mode === "text" ? (
        <WriteStandup id={id} author={author} onSaved={setStandups} onError={setError} />
      ) : (
      <section className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1">
          <h2 className="font-bold">Voice standup</h2>
          <p className="text-sm text-muted">Say what you did, what&apos;s next and what&apos;s blocking you. It gets transcribed and summarised.</p>
        </div>
        {recording ? (
          <button className="btn border-danger/40 bg-danger-soft text-danger" onClick={stop}>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> Stop · {mmss(seconds)}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={start} disabled={uploading}>
            {!uploading && <Mic aria-hidden className="size-4" />}{uploading ? "Transcribing…" : "Record"}
          </button>
        )}
      </section>
      )}
      {error && <Banner tone="danger">{error}</Banner>}

      {standups.length === 0 && !uploading && <p className="text-center text-sm text-muted">No standups yet.</p>}
      {standups.map((s) => (
        <article key={s.id} className="card space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="font-medium">{s.author ?? "Me"}</span>
              <span className="text-muted"> · {fmtDateTime(s.createdAt)}{s.durationSec ? ` · ${mmss(s.durationSec)}` : ""}</span>
              <Badge className="ml-2">{s.kind === "text" ? <><PenLine aria-hidden className="size-3" /> Written</> : <><Mic aria-hidden className="size-3" /> Voice</>}</Badge>
            </div>
            <button className="text-xs text-muted hover:text-danger" onClick={() => remove(s)}>Delete</button>
          </div>
          {s.kind === "voice" && <audio controls preload="none" src={`/api/standups/${s.id}/audio`} className="h-9 w-full" />}
          {s.summary && (
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["Done", s.summary.done, "text-ok"],
                  ["Next", s.summary.next, "text-accent"],
                  ["Blockers", s.summary.blockers, "text-danger"],
                ] as const
              ).map(([label, items, tone]) => (
                <div key={label} className="rounded-lg bg-surface-2 p-2">
                  <h4 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</h4>
                  {items.length ? (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  ) : (
                    <p className="text-xs text-muted">—</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {s.transcript && (
            <details open={s.kind === "text" && !s.summary}>
              <summary className="cursor-pointer text-xs text-muted">{s.kind === "text" ? "Note" : "Transcript"}</summary>
              <p className="mt-1 whitespace-pre-wrap text-xs">{s.transcript}</p>
            </details>
          )}
          {s.error && (
            <p className="text-xs text-warn">
              {s.error} <button className="text-accent hover:underline" onClick={() => retry(s)}>Retry</button>
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

const lines = (s: string) => s.split("\n").map((x) => x.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);

/** Type done / next / blockers yourself (saved as is), or write a free note and let the AI split it. */
function WriteStandup({ id, author, onSaved, onError }: { id: string; author: string; onSaved: (s: Standup[]) => void; onError: (e: string | null) => void }) {
  const [parts, setParts] = useState({ done: "", next: "", blockers: "" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const typed = Boolean(parts.done.trim() || parts.next.trim() || parts.blockers.trim());
  const empty = !typed && !note.trim();

  const save = async () => {
    setSaving(true);
    onError(null);
    try {
      const d = await call<{ standups: Standup[] }>(`/api/h/${hid(id)}/standups`, "POST", {
        author,
        note,
        done: lines(parts.done),
        next: lines(parts.next),
        blockers: lines(parts.blockers),
      });
      onSaved(d.standups);
      setParts({ done: "", next: "", blockers: "" });
      setNote("");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-bold">Written standup</h2>
        <p className="text-sm text-muted">Fill in the three lists (one item per line), or just write a note and it gets split into them for you.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["done", "Done", "Set up auth\nFirst API route"],
            ["next", "Next", "Hook up the UI"],
            ["blockers", "Blockers", "Waiting on API key"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} className="block">
            <span className="label">{label}</span>
            <textarea className="input min-h-24 text-sm" placeholder={placeholder} value={parts[key]} onChange={(e) => setParts({ ...parts, [key]: e.target.value })} />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="label">Or a free note</span>
        <textarea
          className="input min-h-20 text-sm"
          placeholder="Got login working, next is the dashboard; stuck on CORS…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{typed ? "Saved exactly as you typed it." : note.trim() ? "The AI will split this into done, next and blockers." : ""}</p>
        <button className="btn btn-primary" disabled={empty || saving} onClick={save}>
          <PenLine aria-hidden className="size-4" /> {saving ? "Saving…" : "Save standup"}
        </button>
      </div>
    </section>
  );
}
