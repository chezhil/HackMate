"use client";

import { Save, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { CertificateList, type CertData } from "./CertificateList";
import { useHackmate } from "./HackmateProvider";
import { PrizeList } from "./PrizeList";
import { Dialog } from "./ui/Dialog";
import { useToast } from "./ui/Toast";
import { call } from "@/lib/client";
import type { Prize, ResultKind } from "@/lib/types";
import { RESULT_LABELS } from "@/lib/types";

/**
 * After a hackathon: the result, prizes and certificates. The result is saved with the button (choosing one moves
 * the hackathon to Results); prizes and certificates save as you add each one.
 */
export function WrapUpDialog({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const { tracked, updateTracked } = useHackmate();
  const toast = useToast();
  const t = tracked.find((x) => x.hackathonId === id);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [certs, setCerts] = useState<CertData>({ certificates: [], missing: [] });
  // undefined = not edited, so the saved value shows through.
  const [editedResult, setResult] = useState<ResultKind | null | undefined>(undefined);
  const [editedNotes, setResultNotes] = useState<string | undefined>(undefined);
  const result = editedResult === undefined ? (t?.result ?? null) : editedResult;
  const resultNotes = editedNotes ?? t?.resultNotes ?? "";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    call<{ prizes: Prize[] }>("/api/prizes").then((d) => setPrizes(d.prizes), (e: Error) => setError(e.message));
    call<CertData>("/api/certificates").then(setCerts, (e: Error) => setError(e.message));
  }, [open, id]);

  const changed = result !== (t?.result ?? null) || resultNotes !== (t?.resultNotes ?? "");

  const close = () => {
    setResult(undefined);
    setResultNotes(undefined);
    setError(null);
    onClose();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // A result is what moves it to Results; details on their own leave it on the Tracker.
      await updateTracked(id, result ? { status: "results", result, resultNotes: resultNotes.trim() || null } : { resultNotes: resultNotes.trim() || null });
      toast({ message: result && t?.status !== "results" ? "Saved. It's in Results now." : "Saved.", tone: "info", duration: 2500 });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t ? `Wrap up: ${t.hackathon.title}` : "Wrap up"}
      size="lg"
      footer={
        <>
          {error && <span className="mr-auto text-sm text-danger">{error}</span>}
          <button type="button" className="btn" onClick={close}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!changed || saving}>
            <Save aria-hidden className="size-4" /> {saving ? "Saving…" : "Save result"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Result</h3>
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
          <p className="text-xs text-muted">
            {!result ? "Pick a result to move it to Results." : t?.status !== "results" ? "Saving moves it to Results." : ""} Prizes and
            certificates save as you add them.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold">Prizes</h3>
          <PrizeList prizes={prizes} onChange={setPrizes} hackathonId={id} />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold">Certificates</h3>
          <CertificateList data={certs} onChange={setCerts} hackathonId={id} />
        </section>
      </div>
    </Dialog>
  );
}
