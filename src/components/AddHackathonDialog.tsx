"use client";

import { Link2, PencilLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHackmate } from "./HackmateProvider";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Banner } from "./ui/Feedback";
import { call, hid } from "@/lib/client";
import { THEMES } from "@/lib/themes";
import type { ImportDraft, ImportPreview, Mode, ResultKind, TrackStatus } from "@/lib/types";
import { RESULT_LABELS } from "@/lib/types";

const BLANK: ImportDraft = {
  url: "", title: "", tagline: null, organizer: null, mode: "online", city: null, country: null, startsAt: null, endsAt: null,
  regEndsAt: null, prizeText: null, themes: [], teamMin: null, teamMax: null, image: null, description: null,
};

const STAGES: { value: TrackStatus; label: string }[] = [
  { value: "interested", label: "Just pin it" },
  { value: "registered", label: "I've registered" },
  { value: "building", label: "I'm building" },
  { value: "submitted", label: "Submitted, expecting results" },
  { value: "results", label: "It's over, results are in" },
];

/** ISO ↔ <input type="date">, in your own time zone. */
const toDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const fromDay = (day: string) => (day ? new Date(`${day}T12:00:00`).toISOString() : null);

/**
 * Add a hackathon that isn't in the feeds by pasting its link. The page is read into a draft you check and
 * edit, then it's saved and pinned at whatever stage you're at — including over, with your result.
 */
export function AddHackathonDialog({
  open,
  onClose,
  defaultStage = "interested",
  manual: startManual = false,
}: {
  open: boolean;
  onClose: () => void;
  defaultStage?: TrackStatus;
  /** Open straight on the empty form, for a hackathon with no page to read. */
  manual?: boolean;
}) {
  const { refresh } = useHackmate();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [stage, setStage] = useState<TrackStatus>(defaultStage);
  const [result, setResult] = useState<ResultKind>("participated");
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const manualPreview: ImportPreview = { draft: BLANK, existingId: null, warning: null, readBy: "manual" };
  const startBlank = () => {
    setError(null);
    setPreview(manualPreview);
    setDraft({ ...BLANK, url: url.trim() });
  };
  // Opened with "Add manually": go straight to the form.
  const [openedManual, setOpenedManual] = useState(false);
  if (open && startManual && !openedManual) {
    setOpenedManual(true);
    setPreview(manualPreview);
    setDraft(BLANK);
  }
  if (!open && openedManual) setOpenedManual(false);

  const close = () => {
    setUrl("");
    setPreview(null);
    setDraft(null);
    setError(null);
    setStage(defaultStage);
    onClose();
  };

  const read = async () => {
    setBusy("read");
    setError(null);
    try {
      const p = await call<ImportPreview>("/api/import", "POST", { action: "preview", url: url.trim() });
      setPreview(p);
      setDraft(p.draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy("save");
    setError(null);
    try {
      const { id } = await call<{ id: string }>("/api/import", "POST", { action: "create", draft, status: stage, result: stage === "results" ? result : null });
      await refresh();
      close();
      // Finished ones open on Wrap-up, where prizes and certificates go; the rest on the overview.
      router.push(`/hackathon/${hid(id)}${stage === "results" ? "?tab=wrapup" : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const set = (patch: Partial<ImportDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Dialog
      open={open}
      onClose={close}
      title={preview?.readBy === "manual" ? "Add a hackathon" : "Add a hackathon from a link"}
      size="lg"
      footer={
        draft && !preview?.existingId ? (
          <>
            {!startManual && <Button variant="ghost" onClick={() => { setPreview(null); setDraft(null); }}>Back</Button>}
            <Button variant="primary" onClick={save} loading={busy === "save"} disabled={!draft.title.trim()}>
              {stage === "results" ? "Add to Results" : "Add and pin"}
            </Button>
          </>
        ) : undefined
      }
    >
      {!draft ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void read();
          }}
        >
          <p className="text-muted">
            For hackathons that aren&apos;t in the feeds, including ones that are already over. Paste the event&apos;s page and HackMate reads the
            details for you to check.
          </p>
          <label className="block">
            <span className="label">Hackathon page</span>
            <div className="flex gap-2">
              <input
                className="input"
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
              <Button type="submit" variant="primary" loading={busy === "read"} disabled={!url.trim()} icon={<Link2 aria-hidden className="size-4" />}>
                {busy === "read" ? "Reading…" : "Read page"}
              </Button>
            </div>
          </label>
          {error && <Banner tone="danger">{error}</Banner>}
          <div className="flex items-center gap-2 border-t border-border pt-3 text-muted">
            <span>No page, or it can&apos;t be read?</span>
            <Button type="button" size="sm" onClick={startBlank} icon={<PencilLine aria-hidden className="size-3.5" />}>
              Enter the details yourself
            </Button>
          </div>
        </form>
      ) : preview?.existingId ? (
        <div className="space-y-3">
          <Banner tone="ok">That hackathon is already in HackMate.</Banner>
          <Link href={`/hackathon/${hid(preview.existingId)}`} className="btn btn-primary" onClick={close}>Open it</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {preview?.readBy === "manual" ? (
            <p className="text-xs text-muted">Only the name is needed. Add what you know; you can change it later.</p>
          ) : preview?.warning ? (
            <Banner tone="warn">{preview.warning}</Banner>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Sparkles aria-hidden className="size-3.5" />{" "}
              {preview?.readBy === "listing" ? `From ${preview.site}'s event data` : `Read from the page${preview?.readBy === "ai" ? " by AI" : ""}`}. Check it and fix anything that&apos;s off.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" span>
              <input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} required autoFocus={preview?.readBy === "manual"} />
            </Field>
            {preview?.readBy === "manual" && (
              <Field label="Website (optional)" span>
                <input className="input" type="url" inputMode="url" placeholder="https://…" value={draft.url} onChange={(e) => set({ url: e.target.value })} />
              </Field>
            )}
            <Field label="One-line description" span>
              <input className="input" value={draft.tagline ?? ""} onChange={(e) => set({ tagline: e.target.value })} />
            </Field>
            <Field label="Organizer">
              <input className="input" value={draft.organizer ?? ""} onChange={(e) => set({ organizer: e.target.value })} />
            </Field>
            <Field label="Format">
              <select className="input" value={draft.mode} onChange={(e) => set({ mode: e.target.value as Mode })}>
                <option value="online">Online</option>
                <option value="offline">In person</option>
                <option value="hybrid">In person, online optional</option>
              </select>
            </Field>
            {draft.mode !== "online" && (
              <>
                <Field label="City">
                  <input className="input" value={draft.city ?? ""} onChange={(e) => set({ city: e.target.value })} />
                </Field>
                <Field label="Country">
                  <input className="input" value={draft.country ?? ""} onChange={(e) => set({ country: e.target.value })} />
                </Field>
              </>
            )}
            <Field label="Starts">
              <input className="input" type="date" value={toDay(draft.startsAt)} onChange={(e) => set({ startsAt: fromDay(e.target.value) })} />
            </Field>
            <Field label="Ends">
              <input className="input" type="date" value={toDay(draft.endsAt)} onChange={(e) => set({ endsAt: fromDay(e.target.value) })} />
            </Field>
            <Field label="Registration closes">
              <input className="input" type="date" value={toDay(draft.regEndsAt)} onChange={(e) => set({ regEndsAt: fromDay(e.target.value) })} />
            </Field>
            <Field label="Prizes">
              <input className="input" placeholder="$10,000 in prizes" value={draft.prizeText ?? ""} onChange={(e) => set({ prizeText: e.target.value })} />
            </Field>
            {preview?.readBy === "manual" && (
              <Field label="Rules, prizes and notes (optional)" span>
                <textarea
                  className="input min-h-24"
                  placeholder="Paste the rules or describe it: tracks, judging, deliverables, team size… Overview, Ask AI and the checklist read this."
                  value={draft.description ?? ""}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </Field>
            )}
            <fieldset className="sm:col-span-2">
              <legend className="label">Themes</legend>
              <div className="flex flex-wrap gap-1.5">
                {THEMES.map((t) => {
                  const on = draft.themes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      className={`chip ${on ? "chip-on" : "hover:text-text"}`}
                      onClick={() => set({ themes: on ? draft.themes.filter((x) => x !== t) : [...draft.themes, t] })}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <Field label="Where are you with it?">
              <select className="input" value={stage} onChange={(e) => setStage(e.target.value as TrackStatus)}>
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            {stage === "results" && (
              <Field label="Your result">
                <select className="input" value={result} onChange={(e) => setResult(e.target.value as ResultKind)}>
                  {(Object.keys(RESULT_LABELS) as ResultKind[]).map((r) => <option key={r} value={r}>{RESULT_LABELS[r]}</option>)}
                </select>
              </Field>
            )}
          </div>
          {stage === "results" && <p className="text-xs text-muted">It goes straight to Results. Add prizes, a certificate and notes on its Wrap-up page next.</p>}
          {error && <Banner tone="danger">{error}</Banner>}
        </div>
      )}
    </Dialog>
  );
}

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${span ? "sm:col-span-2" : ""}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
