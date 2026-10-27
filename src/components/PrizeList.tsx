"use client";

import { Trophy, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useHackmate } from "./HackmateProvider";
import { SOFT } from "./ui/tone";
import { call, hid } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { Prize, PrizeStatus } from "@/lib/types";
import { PRIZE_STATUS_LABELS } from "@/lib/types";

const STATUS_STYLE: Record<PrizeStatus, string> = {
  won: SOFT.warn,
  claimed: SOFT.accent,
  paid: SOFT.ok,
};
const NEXT: Record<PrizeStatus, PrizeStatus | null> = { won: "claimed", claimed: "paid", paid: null };
const CURRENCIES = ["INR", "USD", "EUR", "GBP"];

export function money(amount: number | null, currency: string) {
  if (amount == null) return "";
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

const BLANK = { title: "", amount: "", currency: "INR", kind: "cash" as Prize["kind"], status: "won" as PrizeStatus, expectedBy: "", notes: "" };

/**
 * Prizes you've won and where each payout stands. Pass `hackathonId` to show and add prizes for one
 * hackathon; otherwise it lists everything and the add form asks which hackathon.
 */
export function PrizeList({
  prizes,
  onChange,
  hackathonId,
  hackathonOptions = [],
}: {
  prizes: Prize[];
  onChange: (p: Prize[]) => void;
  hackathonId?: string;
  hackathonOptions?: { id: string; title: string }[];
}) {
  const [form, setForm] = useState({ ...BLANK, hackathonId: hackathonId ?? "" });
  const [adding, setAdding] = useState(false);
  const { now } = useHackmate();
  const shown = hackathonId ? prizes.filter((p) => p.hackathonId === hackathonId) : prizes;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = await call<{ prizes: Prize[] }>("/api/prizes", "POST", {
      ...form,
      amount: form.amount === "" ? null : Number(form.amount),
      expectedBy: form.expectedBy ? new Date(form.expectedBy).toISOString() : null,
    });
    onChange(d.prizes);
    setForm({ ...BLANK, hackathonId: hackathonId ?? "" });
    setAdding(false);
  };

  const patch = (p: Prize, body: Partial<Prize>) => call<{ prizes: Prize[] }>(`/api/prizes/${p.id}`, "PATCH", body).then((d) => onChange(d.prizes));

  return (
    <div className="space-y-2">
      {shown.length === 0 && !adding && <p className="text-sm text-muted">No prizes recorded.</p>}
      <ul className="space-y-2">
        {shown.map((p) => {
          const overdue = p.status !== "paid" && p.expectedBy && new Date(p.expectedBy).getTime() < now;
          const next = NEXT[p.status];
          return (
            <li key={p.id} className="group rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    <Trophy aria-hidden className="mr-1 inline size-4 align-text-bottom text-warn" />
                    {p.title}
                    {p.amount != null && <span className="ml-2 text-ok">{money(p.amount, p.currency)}</span>}
                    {p.kind !== "cash" && <span className="ml-2 text-xs text-muted">({p.kind})</span>}
                  </div>
                  {!hackathonId && (
                    <Link href={`/hackathon/${hid(p.hackathonId)}`} className="text-xs text-muted hover:underline">{p.hackathonTitle}</Link>
                  )}
                  <div className="text-xs text-muted">
                    {p.status === "paid" && p.paidAt ? `Paid ${fmtDate(p.paidAt)}` : p.expectedBy ? `Expected by ${fmtDate(p.expectedBy)}` : ""}
                    {overdue && <span className="ml-1 font-medium text-danger">· overdue — follow up with the organizers</span>}
                  </div>
                  {p.notes && <div className="text-xs text-muted">{p.notes}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    className={`rounded-md border-0 px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                    value={p.status}
                    onChange={(e) => patch(p, { status: e.target.value as PrizeStatus })}
                    aria-label="Payout status"
                  >
                    {(Object.keys(PRIZE_STATUS_LABELS) as PrizeStatus[]).map((s) => <option key={s} value={s}>{PRIZE_STATUS_LABELS[s]}</option>)}
                  </select>
                  {next && <button className="text-xs text-accent hover:underline" onClick={() => patch(p, { status: next })}>Mark {next}</button>}
                  <button
                    className="text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                    title="Delete"
                    onClick={() => confirm(`Delete "${p.title}"?`) && call<{ prizes: Prize[] }>(`/api/prizes/${p.id}`, "DELETE").then((d) => onChange(d.prizes))}
                  >
                    <X aria-hidden className="size-3.5" /><span className="sr-only">Delete prize</span>
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {adding ? (
        <form onSubmit={add} className="grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-2">
          {!hackathonId && (
            <select className="input sm:col-span-2" required value={form.hackathonId} onChange={(e) => setForm({ ...form, hackathonId: e.target.value })}>
              <option value="">Which hackathon?</option>
              {hackathonOptions.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}
            </select>
          )}
          <input className="input sm:col-span-2" required placeholder="Prize (e.g. 1st place, Best use of Gemini)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="flex gap-1.5">
            <input className="input" type="number" min="0" step="any" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <select className="input w-auto" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Prize["kind"] })}>
            <option value="cash">Cash</option>
            <option value="swag">Swag / gadgets</option>
            <option value="credits">Credits</option>
            <option value="other">Other</option>
          </select>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PrizeStatus })}>
            {(Object.keys(PRIZE_STATUS_LABELS) as PrizeStatus[]).map((s) => <option key={s} value={s}>{PRIZE_STATUS_LABELS[s]}</option>)}
          </select>
          <label className="text-xs text-muted">
            Payout expected by
            <input className="input mt-0.5" type="date" value={form.expectedBy} onChange={(e) => setForm({ ...form, expectedBy: e.target.value })} />
          </label>
          <input className="input sm:col-span-2" placeholder="Notes (bank form sent, contact person…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn btn-primary">Save prize</button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-sm" onClick={() => setAdding(true)}>+ Add a prize</button>
      )}
    </div>
  );
}
