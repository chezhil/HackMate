"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  tone: "info" | "error";
  undo?: () => void;
}

const ToastContext = createContext<(t: Omit<ToastItem, "id">) => void>(() => {});

export const useToast = () => useContext(ToastContext);

/** Bottom-left stack. Toasts with Undo stay 8 s, others 4 s; errors stay until dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = ++next.current;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      if (t.tone !== "error") setTimeout(() => dismiss(id), t.undo ? 8000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-(--z-toast) flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : undefined}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl border-(length:--line) bg-surface px-3 py-2 text-sm font-medium shadow-pop ${t.tone === "error" ? "border-danger text-danger" : "border-border"}`}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.undo && (
              <button type="button" className="font-medium text-accent hover:underline" onClick={() => { t.undo?.(); dismiss(t.id); }}>
                Undo
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="text-muted hover:text-text" onClick={() => dismiss(t.id)}>
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
