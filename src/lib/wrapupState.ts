// Pure: decides whether a hackathon with results is fully wrapped up, and what's still open if not.
import type { Certificate, Prize, TrackedWithHackathon } from "./types";

/** Same formatting as the prize list (₹50,000 / $1,000). */
export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export interface WrapUpState {
  resolved: boolean;
  /** Short, human reasons it isn't done yet, e.g. "₹50,000 prize not paid yet". */
  open: { text: string; urgent: boolean }[];
}

/**
 * Resolved = result recorded, a prize recorded for a win or placing, every prize paid, and no certificate
 * you're still waiting on.
 * A hackathon with no certificate entry at all doesn't count as waiting: many never give one.
 */
export function wrapUpState(t: TrackedWithHackathon, prizes: Prize[], certs: Certificate[], now = Date.now()): WrapUpState {
  const open: WrapUpState["open"] = [];
  if (!t.result) open.push({ text: "Result not recorded", urgent: false });
  const own = prizes.filter((x) => x.hackathonId === t.hackathonId);
  // A win or placing usually comes with a prize; until one is recorded it isn't "everything filled out".
  if ((t.result === "won" || t.result === "runner_up") && own.length === 0) open.push({ text: "Won, but no prize recorded yet", urgent: false });
  for (const p of own.filter((x) => x.status !== "paid")) {
    const overdue = Boolean(p.expectedBy && new Date(p.expectedBy).getTime() < now);
    const amount = p.amount != null ? formatMoney(p.amount, p.currency) : p.title;
    open.push({ text: `${amount} ${p.status === "claimed" ? "claimed, not paid yet" : "not claimed yet"}${overdue ? " (overdue)" : ""}`, urgent: overdue });
  }
  for (const c of certs.filter((x) => x.hackathonId === t.hackathonId && x.status === "pending")) {
    open.push({ text: `Certificate pending: ${c.title}`, urgent: false });
  }
  return { resolved: open.length === 0, open };
}
