"use client";

import { FileText, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Badge, CheckRow, CheckSummary } from "@/components/ui/Feedback";
import { useConfirm } from "@/components/ui/Confirm";
import { ProjectCard } from "@/components/ProjectCard";
import { call, hid } from "@/lib/client";
import type { AiOutput, ChecklistItem, ChecklistKind, SubmissionCheck, Writeup } from "@/lib/types";

const ACCEPT = { image: "image/*", video: "video/*", pdf: "application/pdf", any: "image/*,video/*,application/pdf" };

/** Length of a video file, read in the browser so we can check it against the limit. */
function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(Number.isFinite(v.duration) ? v.duration : null);
    };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
}

export function SubmitTab({ id }: { id: string }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [result, setResult] = useState<{ checks: SubmissionCheck[]; summary: string | null } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [newItem, setNewItem] = useState({ label: "", kind: "check" as ChecklistKind });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ items: ChecklistItem[] }>(`/api/h/${hid(id)}/checklist`).then((d) => setItems(d.items));
  }, [id]);

  const patch = (item: ChecklistItem, body: { done?: boolean; value?: string | null }) =>
    call<{ items: ChecklistItem[] }>(`/api/checklist/${item.id}`, "PATCH", body).then((d) => setItems(d.items));

  const upload = async (item: ChecklistItem, file: File) => {
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (file.type.startsWith("video/")) {
      const d = await videoDuration(file);
      if (d) form.append("durationSec", String(d));
    }
    const res = await fetch(`/api/checklist/${item.id}`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else setItems(data.items);
  };

  const verify = async () => {
    setVerifying(true);
    try {
      setResult(await call(`/api/h/${hid(id)}/checklist/verify`, "POST"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const required = items.filter((i) => i.required);
  const ready = required.filter((i) => i.done || i.value || i.file).length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-main-side">
      <div className="space-y-4">
        <ProjectCard id={id} />

        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Submission checklist</h2>
              <p className="text-sm text-muted">Built from this hackathon&apos;s rules. Attach links and files as proof.</p>
            </div>
            <Badge tone={ready === required.length ? "ok" : "neutral"} className="shrink-0 tabular-nums">
              {ready}/{required.length} required done
            </Badge>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                checks={result?.checks.filter((c) => c.itemId === item.id) ?? []}
                onPatch={(b) => patch(item, b)}
                onUpload={(f) => upload(item, f)}
                onRemoveFile={() => call<{ items: ChecklistItem[] }>(`/api/checklist/${item.id}?file`, "DELETE").then((d) => setItems(d.items))}
                onDelete={() => call<{ items: ChecklistItem[] }>(`/api/checklist/${item.id}`, "DELETE").then((d) => setItems(d.items))}
              />
            ))}
          </ul>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = await call<{ items: ChecklistItem[] }>(`/api/h/${hid(id)}/checklist`, "POST", { ...newItem, required: true });
              setItems(d.items);
              setNewItem({ label: "", kind: "check" });
            }}
          >
            <input className="input min-w-48 flex-1" placeholder="Add an item (e.g. Usage card screenshot)" value={newItem.label} onChange={(e) => setNewItem({ ...newItem, label: e.target.value })} />
            <select className="input w-auto" value={newItem.kind} onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as ChecklistKind })}>
              <option value="check">Tick box</option>
              <option value="link">Link</option>
              <option value="file">File / screenshot</option>
            </select>
            <button className="btn" disabled={!newItem.label.trim()}>Add</button>
          </form>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card space-y-3 p-4">
          <div>
            <h2 className="font-semibold">Check my submission</h2>
            <p className="text-sm text-muted">Checks the deadline, team size, that links open, that the repo is public with a README, video length, screenshots, and runs an AI review against the rules.</p>
          </div>
          <button className="btn btn-primary w-full" onClick={verify} disabled={verifying}>{verifying ? "Checking…" : result ? "Check again" : "Check submission"}</button>
          {result && (
            <div className="space-y-2">
              <CheckSummary statuses={result.checks.map((c) => c.status)} />
              {result.summary && <p className="text-sm font-medium">{result.summary}</p>}
              <ul className="space-y-1.5">
                {result.checks.map((c, i) => <CheckRow key={i} status={c.status} label={c.label} detail={c.detail} />)}
              </ul>
            </div>
          )}
        </section>
        <WriteupPanel id={id} />
      </aside>
    </div>
  );
}

function ChecklistRow({
  item,
  checks,
  onPatch,
  onUpload,
  onRemoveFile,
  onDelete,
}: {
  item: ChecklistItem;
  checks: SubmissionCheck[];
  onPatch: (b: { done?: boolean; value?: string | null }) => void;
  onUpload: (f: File) => void;
  onRemoveFile: () => void;
  onDelete: () => void;
}) {
  const confirm = useConfirm();
  const [value, setValue] = useState(item.value ?? "");
  const [uploading, setUploading] = useState(false);
  const accept = item.meta?.accept ?? (item.kind === "file" ? "any" : undefined);
  const done = item.done || Boolean(item.value || item.file);
  const worst = checks.find((c) => c.status === "fail") ?? checks.find((c) => c.status === "warn");

  return (
    <li className="group space-y-1.5 py-2.5 text-sm">
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={done} onChange={(e) => onPatch({ done: e.target.checked })} />
        <div className="min-w-0 flex-1">
          <div className={done ? "text-muted line-through" : "font-medium"}>
            {item.label}
            {!item.required && <span className="ml-1.5 text-xs text-muted no-underline">(optional)</span>}
            {item.origin === "rules" && <Badge tone="accent" className="ml-1.5 no-underline">from rules</Badge>}
          </div>
          {item.detail && <div className="text-xs text-muted">{item.detail}</div>}
          {worst && <div className={`text-xs ${worst.status === "fail" ? "text-danger" : "text-warn"}`}>{worst.detail}</div>}
        </div>
        <button className="text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100" title="Remove" onClick={async () => (await confirm({ title: "Remove this checklist item?", body: `"${item.label}" and any link or file attached to it are removed.`, confirmLabel: "Remove" })) && onDelete()}><X aria-hidden className="size-3.5" /><span className="sr-only">Remove item</span></button>
      </div>
      {(item.kind === "link" || accept) && (
        <div className="ml-6 flex flex-wrap items-center gap-2">
          {item.kind === "link" && (
            <input
              className="input min-w-48 flex-1 py-1 text-xs"
              placeholder="https://…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => value !== (item.value ?? "") && onPatch({ value })}
            />
          )}
          {accept && !item.file && (
            <label className="btn btn-sm cursor-pointer">
              {uploading ? "Uploading…" : item.kind === "link" ? "or upload" : `Upload ${accept === "image" ? "screenshot" : accept === "video" ? "video" : "file"}`}
              <input
                type="file"
                accept={ACCEPT[accept]}
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  await onUpload(f);
                  setUploading(false);
                }}
              />
            </label>
          )}
        </div>
      )}
      {item.file && (
        <div className="ml-6 flex items-center gap-2">
          {item.mime?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={`/api/files/${item.file}`} target="_blank" rel="noreferrer"><img src={`/api/files/${item.file}`} alt={item.label} className="h-16 rounded-md border border-border object-cover" /></a>
          ) : (
            <a href={`/api/files/${item.file}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              {item.mime?.startsWith("video/") ? <><Video aria-hidden className="size-3.5" /> Video</> : <><FileText aria-hidden className="size-3.5" /> File</>} attached
              {item.meta?.durationSec ? ` · ${Math.round(item.meta.durationSec)}s` : ""}
            </a>
          )}
          {item.meta?.durationSec && item.meta.limitSec && item.meta.durationSec > item.meta.limitSec && (
            <span className="text-xs text-danger">over the {item.meta.limitSec}s limit</span>
          )}
          <button className="text-xs text-muted hover:text-danger" onClick={onRemoveFile}>Remove</button>
        </div>
      )}
    </li>
  );
}

const PLATFORMS: { key: Writeup["platform"]; label: string; share: (t: string) => string }[] = [
  { key: "linkedin", label: "LinkedIn", share: (t) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(t)}` },
  { key: "x", label: "X thread", share: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t.split(/\n-{3,}\n/)[0])}` },
  { key: "devto", label: "Dev.to blog", share: () => "https://dev.to/new" },
];

function WriteupPanel({ id }: { id: string }) {
  const [platform, setPlatform] = useState<Writeup["platform"]>("linkedin");
  const [extra, setExtra] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<{ outputs: AiOutput<Writeup>[] }>(`/api/h/${hid(id)}/pitch`).then((d) => {
      const latest: Record<string, string> = {};
      for (const o of d.outputs.filter((x) => x.kind === "writeup").reverse()) latest[o.content.platform] = o.content.text;
      setDrafts(latest);
    });
  }, [id]);

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await call<{ output: AiOutput<Writeup> }>(`/api/h/${hid(id)}/pitch`, "POST", { kind: "writeup", platform, extra });
      setDrafts((x) => ({ ...x, [platform]: d.output.content.text }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const p = PLATFORMS.find((x) => x.key === platform)!;
  const text = drafts[platform] ?? "";

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Write it up</h2>
        <p className="text-sm text-muted">Posts about your project. Many hackathons give prizes for the best one.</p>
      </div>
      <div className="flex rounded-lg border border-border p-0.5 text-xs">
        {PLATFORMS.map((x) => (
          <button key={x.key} onClick={() => setPlatform(x.key)} className={`flex-1 rounded-md px-2 py-1 ${platform === x.key ? "bg-surface-2 font-medium" : "text-muted"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <input className="input text-xs" placeholder="Anything to mention? (sponsor tools, a funny moment, @handles)" value={extra} onChange={(e) => setExtra(e.target.value)} />
      <button className="btn btn-primary w-full" onClick={write} disabled={busy}>{busy ? "Writing…" : text ? "Rewrite" : `Write ${p.label} post`}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {text && (
        <div className="space-y-2">
          <textarea className="input min-h-56 font-mono text-xs" value={text} onChange={(e) => setDrafts((x) => ({ ...x, [platform]: e.target.value }))} />
          <div className="flex gap-1.5">
            <CopyButton text={text} />
            <a className="btn btn-sm" href={p.share(text)} target="_blank" rel="noreferrer">
              {platform === "devto" ? "Open dev.to editor ↗" : `Post on ${p.label} ↗`}
            </a>
          </div>
          {platform === "x" && <p className="text-xs text-muted">X opens with the first post; paste the rest as replies.</p>}
        </div>
      )}
    </section>
  );
}
