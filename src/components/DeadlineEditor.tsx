"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { fmtDateTime, relative, toLocalInput, urgency } from "@/lib/format";
import type { DeadlineKind, TrackedWithHackathon } from "@/lib/types";
import { DEADLINE_LABELS } from "@/lib/types";
import { useHackmate } from "./HackmateProvider";

const URGENCY_STYLE = {
  past: "text-muted line-through",
  soon: "text-danger font-medium",
  near: "text-warn",
  later: "text-muted",
};

/** Deadlines for one tracked hackathon: tick off, move, delete, or add your own. */
export function DeadlineEditor({ t }: { t: TrackedWithHackathon }) {
  const { addDeadline, updateDeadline, deleteDeadline } = useHackmate();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [kind, setKind] = useState<DeadlineKind>("submission");
  const [label, setLabel] = useState("");
  const [due, setDue] = useState("");

  return (
    <div className="space-y-1.5">
      {t.deadlines.length === 0 && <p className="text-xs text-muted">No dates from the feed. Add the ones that matter.</p>}
      {t.deadlines.map((d) => (
        <div key={d.id} className="group flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={d.done}
            onChange={(e) => updateDeadline(d.id, { done: e.target.checked })}
            title="Mark done"
          />
          <div className="min-w-0 flex-1">
            <span className={d.done ? "text-muted line-through" : ""}>{d.label}</span>
            {editing === d.id ? (
              <input
                type="datetime-local"
                className="input mt-1 py-0.5 text-xs"
                defaultValue={toLocalInput(d.dueAt)}
                autoFocus
                onBlur={(e) => {
                  if (e.target.value) void updateDeadline(d.id, { dueAt: new Date(e.target.value).toISOString() });
                  setEditing(null);
                }}
              />
            ) : (
              <button
                className={`block text-left hover:underline ${d.done ? "text-muted" : URGENCY_STYLE[urgency(d.dueAt)]}`}
                onClick={() => setEditing(d.id)}
                title="Change date"
              >
                {fmtDateTime(d.dueAt)} · {relative(d.dueAt)}
              </button>
            )}
          </div>
          <button
            className="text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => deleteDeadline(d.id)}
            title="Delete deadline"
          >
            <X aria-hidden className="size-3.5" /><span className="sr-only">Delete deadline</span>
          </button>
        </div>
      ))}
      {adding ? (
        <form
          className="space-y-1.5 rounded-lg bg-surface-2 p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!due) return;
            await addDeadline(t.hackathonId, kind, label, new Date(due).toISOString());
            setAdding(false);
            setLabel("");
            setDue("");
          }}
        >
          <select className="input py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as DeadlineKind)}>
            {(Object.keys(DEADLINE_LABELS) as DeadlineKind[]).map((k) => (
              <option key={k} value={k}>{DEADLINE_LABELS[k]}</option>
            ))}
          </select>
          <input className="input py-1 text-xs" placeholder={`Label (default: ${DEADLINE_LABELS[kind]})`} value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input py-1 text-xs" type="datetime-local" required value={due} onChange={(e) => setDue(e.target.value)} />
          <div className="flex gap-1.5">
            <button className="btn btn-primary btn-sm" type="submit">Add</button>
            <button className="btn btn-sm" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="text-xs text-accent hover:underline" onClick={() => setAdding(true)}>+ Add deadline</button>
      )}
    </div>
  );
}
