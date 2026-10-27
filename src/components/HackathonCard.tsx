"use client";

import Link from "next/link";
import { hid } from "@/lib/client";
import { fmtDate, fmtRange, place, relative } from "@/lib/format";
import { useHackmate } from "./HackmateProvider";
import type { Hackathon } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

const MODE_STYLE: Record<Hackathon["mode"], string> = {
  online: "bg-accent-soft text-accent",
  offline: "bg-surface-2 text-text",
  hybrid: "bg-warn-soft text-warn",
};

export function HackathonCard({
  h,
  tracked,
  clashesWith,
  selected,
  onTrack,
  onUntrack,
  onSelect,
}: {
  h: Hackathon;
  tracked: boolean;
  clashesWith: Hackathon[];
  selected?: boolean;
  onTrack: () => void;
  onUntrack: () => void;
  onSelect?: () => void;
}) {
  const { now } = useHackmate();
  const regOpen = h.regEndsAt && new Date(h.regEndsAt).getTime() > now;
  return (
    <article
      id={`h-${h.id}`}
      onClick={onSelect}
      className={`card flex gap-3 p-3 transition ${selected ? "ring-2 ring-accent" : ""} ${onSelect ? "cursor-pointer hover:border-muted" : ""}`}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        {h.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={h.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium leading-snug">
            <Link href={`/hackathon/${hid(h.id)}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {h.title}
            </Link>
            <a
              href={h.url}
              target="_blank"
              rel="noreferrer"
              className="ml-1.5 text-xs text-muted hover:text-accent"
              title="Open on the hackathon's site"
              onClick={(e) => e.stopPropagation()}
            >
              ↗
            </a>
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (tracked) onUntrack();
              else onTrack();
            }}
            className={`btn btn-sm shrink-0 ${tracked ? "border-ok/40 bg-ok-soft text-ok" : ""}`}
            title={tracked ? "Remove from tracker" : "Pin to tracker"}
          >
            {tracked ? "✓ Tracking" : "📌 Pin"}
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className={`rounded px-1.5 py-0.5 font-medium capitalize ${MODE_STYLE[h.mode]}`}>{h.mode}</span>
          {h.mode !== "online" && <span>{place(h)} ·</span>}
          <span>{fmtRange(h)}</span>
          <span>·</span>
          <span>{SOURCE_LABELS[h.source]}</span>
        </div>
        {h.tagline && h.tagline !== h.prizeText && <p className="mt-1 line-clamp-1 text-sm text-muted">{h.tagline}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {h.prizeText && <span className="chip border-ok/30 text-ok">🏆 {h.prizeText}</span>}
          {h.entryFee === "paid" && <span className="chip border-warn/30 text-warn">Paid entry</span>}
          {regOpen && (
            <span className="chip" title={fmtDate(h.regEndsAt)}>
              Reg closes {relative(h.regEndsAt!, now)}
            </span>
          )}
          {h.themes.slice(0, 3).map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
          {clashesWith.length > 0 && (
            <span className="chip border-danger/30 bg-danger-soft text-danger" title={clashesWith.map((c) => c.title).join(", ")}>
              ⚠ Clashes with {clashesWith[0].title}
              {clashesWith.length > 1 ? ` +${clashesWith.length - 1}` : ""}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
