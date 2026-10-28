"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";

/** Native <dialog>: the browser traps focus, closes on Escape and returns focus to the opener. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "lg" for forms; the body scrolls when it's taller than the screen. */
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] flex-col rounded-2xl border-(length:--line) border-border bg-surface p-0 text-text shadow-pop backdrop:bg-(--scrim) open:flex ${
        size === "lg" ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(32rem,calc(100vw-2rem))]"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b-(length:--line) border-border bg-warn-soft px-4 py-3">
        <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
        <IconButton label="Close" icon={<X className="size-4" />} onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
    </dialog>
  );
}
