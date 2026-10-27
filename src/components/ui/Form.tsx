"use client";

import { useId, type ReactNode } from "react";

interface FieldControl {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

/** Label, control, hint and error wired together. The control gets its id and aria props from the render function. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (control: FieldControl) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children({ id, "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? true : undefined })}
      {hint && !error && <p id={hintId} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={errorId} className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Filter chip that stays on until clicked again. */
export function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`chip ${on ? "chip-on" : "hover:text-text"}`}>
      {children}
    </button>
  );
}
