"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

interface Option<K extends string> {
  key: K;
  label: string;
  badge?: ReactNode;
}

/** Arrow keys, Home and End move between options; only the selected one is in the tab order. */
function useRoving<K extends string>(options: readonly Option<K>[], value: K, onChange: (k: K) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.key === value);
    const next =
      e.key === "ArrowRight" ? (i + 1) % options.length
        : e.key === "ArrowLeft" ? (i - 1 + options.length) % options.length
          : e.key === "Home" ? 0
            : e.key === "End" ? options.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].key);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

/** Underline tabs for switching sections of one page. */
export function Tabs<K extends string>({ tabs, value, onChange, label, className = "" }: { tabs: readonly Option<K>[]; value: K; onChange: (k: K) => void; label: string; className?: string }) {
  const { refs, onKeyDown } = useRoving(tabs, value, onChange);
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={`flex gap-1 overflow-x-auto border-b border-border ${className}`}>
      {tabs.map((t, i) => (
        <button
          key={t.key}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          type="button"
          aria-selected={value === t.key}
          tabIndex={value === t.key ? 0 : -1}
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors duration-(--dur-fast) ${
            value === t.key ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text"
          }`}
        >
          {t.label}
          {t.badge != null && <span className="ml-1.5">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Compact one-of-n switch, e.g. split / list / map. */
export function Segmented<K extends string>({ options, value, onChange, label }: { options: readonly Option<K>[]; value: K; onChange: (k: K) => void; label: string }) {
  const { refs, onKeyDown } = useRoving(options, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex rounded-lg border border-border p-0.5 text-sm">
      {options.map((o, i) => (
        <button
          key={o.key}
          ref={(el) => { refs.current[i] = el; }}
          role="radio"
          type="button"
          aria-checked={value === o.key}
          tabIndex={value === o.key ? 0 : -1}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-2.5 py-1 ${value === o.key ? "bg-surface-2 font-medium text-text" : "text-muted hover:text-text"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
