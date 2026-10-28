"use client";

import { ArrowRight, Ban, Check, ExternalLink, Globe, MapPin, Pin, Sparkles, TriangleAlert, Trophy } from "lucide-react";
import type { AiPolicyKind } from "@/lib/aiPolicy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hid } from "@/lib/client";
import { fmtRange, place } from "@/lib/format";
import { useHackmate } from "./HackmateProvider";
import { Countdown } from "./ui/Countdown";
import { Badge } from "./ui/Feedback";
import type { Tone } from "./ui/tone";
import type { Hackathon } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

/** How you take part. Hybrid events are in person, with joining online as an option. */
const ATTEND: Record<Hackathon["mode"], { label: string; tone: Tone; Icon: typeof Globe }> = {
  online: { label: "Online", tone: "accent", Icon: Globe },
  offline: { label: "In person", tone: "warn", Icon: MapPin },
  hybrid: { label: "In person · online optional", tone: "ok", Icon: MapPin },
};

const AI_BADGE: Record<AiPolicyKind, { label: string; tone: Tone; Icon: typeof Globe }> = {
  allowed: { label: "AI allowed", tone: "ok", Icon: Sparkles },
  conditional: { label: "AI with conditions", tone: "warn", Icon: Sparkles },
  banned: { label: "No AI", tone: "danger", Icon: Ban },
};

/** The hackathon's stated rule on AI tools; hover shows the sentence it came from. Hidden when the rules don't say. */
export function AiPolicyBadge({ policy }: { policy: Hackathon["aiPolicy"] }) {
  if (!policy) return null;
  const { label, tone, Icon } = AI_BADGE[policy.kind];
  return (
    <Badge tone={tone} title={`From the rules: “${policy.quote}”`}>
      <Icon aria-hidden className="size-3" />
      {label}
      <span className="sr-only">. From the rules: {policy.quote}</span>
    </Badge>
  );
}

export function AttendBadge({ mode }: { mode: Hackathon["mode"] }) {
  const { label, tone, Icon } = ATTEND[mode];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden className="size-3" />
      {label}
    </Badge>
  );
}

export function HackathonCard({
  h,
  tracked,
  clashesWith,
  selected,
  highlighted,
  onTrack,
  onUntrack,
  onHover,
}: {
  h: Hackathon;
  tracked: boolean;
  clashesWith: Hackathon[];
  selected?: boolean;
  /** Its pin is hovered on the map. */
  highlighted?: boolean;
  onTrack: () => void;
  onUntrack: () => void;
  /** Hover or keyboard focus, so the map can light up the matching pin. */
  onHover?: (id: string | null) => void;
}) {
  const { now } = useHackmate();
  const router = useRouter();
  const regOpen = h.regEndsAt && new Date(h.regEndsAt).getTime() > now;
  return (
    <article
      id={`h-${h.id}`}
      // The whole tile opens the hackathon; the title link is the keyboard way in, and the buttons stop the click.
      onClick={() => router.push(`/hackathon/${hid(h.id)}`)}
      onMouseEnter={onHover && (() => onHover(h.id))}
      onMouseLeave={onHover && (() => onHover(null))}
      onFocus={onHover && (() => onHover(h.id))}
      onBlur={onHover && ((e) => !e.currentTarget.contains(e.relatedTarget as Node) && onHover(null))}
      className={`card flex gap-3 p-3 ${selected ? "bg-accent-soft" : highlighted ? "bg-warn-soft" : ""} card-lift cursor-pointer`}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border-(length:--line) border-border bg-surface-2">
        {h.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={h.image} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 min-w-0 break-words font-bold leading-snug" title={h.title}>
            <Link href={`/hackathon/${hid(h.id)}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {h.title}
            </Link>
          </h3>
          <div className="flex shrink-0 flex-col items-stretch gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (tracked) onUntrack();
                else onTrack();
              }}
              className={`btn btn-sm ${tracked ? "bg-ok-soft text-ok" : ""}`}
              title={tracked ? "Remove from tracker" : "Pin to tracker"}
            >
              {tracked ? <><Check aria-hidden className="size-3.5" /> Tracking</> : <><Pin aria-hidden className="size-3.5" /> Pin</>}
            </button>
            <Link
              href={`/hackathon/${hid(h.id)}`}
              className="btn btn-sm btn-primary"
              title="Rules, Ask AI, ideas, pitch and Q&A tools"
              onClick={(e) => e.stopPropagation()}
            >
              Open <ArrowRight aria-hidden className="size-3.5" />
              <span className="sr-only"> {h.title} in HackMate</span>
            </Link>
            <a
              href={h.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
              title={`Open ${h.title} on ${SOURCE_LABELS[h.source]}`}
              onClick={(e) => e.stopPropagation()}
            >
              Website <ExternalLink aria-hidden className="size-3.5" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <AttendBadge mode={h.mode} />
          <AiPolicyBadge policy={h.aiPolicy} />
          {h.mode !== "online" && <span>{place(h)} ·</span>}
          <span>{fmtRange(h)}</span>
          <span>·</span>
          <span>{SOURCE_LABELS[h.source]}</span>
          {h.sourceListings && h.sourceListings.length > 1 && (
            <span className="inline-flex flex-wrap gap-x-2" aria-label="Other listings of this event">
              {h.sourceListings.filter((other) => other.id !== h.id).map((other) => (
                <a key={other.id} href={other.url} target="_blank" rel="noreferrer" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                  Also on {SOURCE_LABELS[other.source]} ↗
                </a>
              ))}
            </span>
          )}
        </div>
        {h.tagline && h.tagline !== h.prizeText && <p className="mt-1 line-clamp-1 break-words text-sm text-muted">{h.tagline}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {h.prizeText && <span className="chip border-ok/30 text-ok"><Trophy aria-hidden className="size-3" /> {h.prizeText}</span>}
          {h.entryFee === "paid" && <span className="chip border-warn/30 text-warn">Paid entry</span>}
          {regOpen && (
            <Countdown to={h.regEndsAt!} label="Reg closes" />
          )}
          {h.themes.slice(0, 3).map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
          {clashesWith.length > 0 && (
            <span className="chip border-danger/30 bg-danger-soft text-danger" title={clashesWith.map((c) => c.title).join(", ")}>
              <TriangleAlert aria-hidden className="size-3" /> Clashes with {clashesWith[0].title}
              {clashesWith.length > 1 ? ` +${clashesWith.length - 1}` : ""}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
