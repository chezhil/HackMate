"use client";

import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { call, hid } from "@/lib/client";
import { useConfirm } from "@/components/ui/Confirm";
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
    (await confirm({ title: "Delete this voice note?", body: "The recording and its transcript are deleted.", confirmLabel: "Delete" })) &&
    call<{ standups: Standup[] }>(`/api/standups/${s.id}`, "DELETE").then((d) => setStandups(d.standups));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1">
          <h2 className="font-semibold">Voice standup</h2>
          <p className="text-sm text-muted">Say what you did, what&apos;s next and what&apos;s blocking you. It gets transcribed and summarised.</p>
        </div>
        <select className="input w-auto" value={author} onChange={(e) => setAuthor(e.target.value)} disabled={recording}>
          <option>Me</option>
          {team.map((t) => <option key={t.id}>{t.name}</option>)}
        </select>
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
      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {standups.length === 0 && !uploading && <p className="text-center text-sm text-muted">No standups yet.</p>}
      {standups.map((s) => (
        <article key={s.id} className="card space-y-2 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="font-medium">{s.author ?? "Me"}</span>
              <span className="text-muted"> · {fmtDateTime(s.createdAt)}{s.durationSec ? ` · ${mmss(s.durationSec)}` : ""}</span>
            </div>
            <button className="text-xs text-muted hover:text-danger" onClick={() => remove(s)}>Delete</button>
          </div>
          <audio controls preload="none" src={`/api/standups/${s.id}/audio`} className="h-9 w-full" />
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
            <details>
              <summary className="cursor-pointer text-xs text-muted">Transcript</summary>
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
