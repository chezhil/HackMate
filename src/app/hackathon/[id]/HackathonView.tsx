"use client";

import { Check, CircleX, Pin, PinOff, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttendBadge } from "@/components/HackathonCard";
import { TOOL_GROUPS, TOOLS, type HackathonTool } from "@/components/hackathonTools";
import { ProjectCard } from "@/components/ProjectCard";
import { useHackmate } from "@/components/HackmateProvider";
import { useConfirm } from "@/components/ui/Confirm";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import type { RuleAlert } from "@/lib/alerts";
import { call, hid } from "@/lib/client";
import { fmtRange, place } from "@/lib/format";
import type { Hackathon, HackathonDetails } from "@/lib/types";
import { SOURCE_LABELS, STATUSES } from "@/lib/types";
import { AskTab } from "./AskTab";
import { IdeasTab } from "./IdeasTab";
import { OverviewTab } from "./OverviewTab";
import { isPitchSection, PitchTab, type PitchSection } from "./PitchTab";
import { StandupsTab } from "./StandupsTab";
import { SubmitTab } from "./SubmitTab";
import { TeamTab } from "./TeamTab";
import { WrapUpTab } from "./WrapUpTab";

export interface AiStatus {
  groq: { configured: boolean; model: string | null };
  gemini: { configured: boolean; model: string | null; coolingDown: boolean };
}

export interface DetailsPayload {
  hackathon: Hackathon;
  details: HackathonDetails | null;
  building: boolean;
  ruleAlerts: RuleAlert[];
  ai: AiStatus;
}

/** The page's sections. The grouped tool panel (TOOL_GROUPS) is how you move between them. */
const TABS = ["overview", "ask", "ideas", "team", "project", "pitch", "submit", "standups", "wrapup"] as const;

type Tab = (typeof TABS)[number];

const isTab = (v: string | null): v is Tab => (TABS as readonly string[]).includes(v ?? "");

export function HackathonView() {
  const id = decodeURIComponent(useParams<{ id: string }>().id);
  const { trackedIds, tracked, track, untrack } = useHackmate();
  const [data, setData] = useState<DetailsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  // The tab lives in the URL (?tab=submit) so a link can open straight onto it.
  const [tab, setTabState] = useState<Tab>(() => {
    const t = params.get("tab");
    return isTab(t) ? t : "overview";
  });
  // The Pitch tab's tool (?section=qa) lives there too, so shortcuts can land on the Deck roaster or Mock Q&A.
  const [section, setSectionState] = useState<PitchSection>(() => {
    const s = params.get("section");
    return isPitchSection(s) ? s : "pitch";
  });
  const go = (t: Tab, s?: PitchSection) => {
    setTabState(t);
    if (s) setSectionState(s);
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    const sec = s ?? section;
    if (t === "pitch" && sec !== "pitch") url.searchParams.set("section", sec);
    else url.searchParams.delete("section");
    window.history.replaceState(null, "", url);
  };
  const confirm = useConfirm();

  // A shortcut (strip or Tracker link) should show the tool, not leave it below the header and strip.
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollToTool = () => requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  const landedOnTool = useRef(params.has("tab"));
  useEffect(() => {
    if (!data || !landedOnTool.current) return;
    landedOnTool.current = false;
    scrollToTool();
  }, [data]);

  const load = useCallback(
    () =>
      call<DetailsPayload>(`/api/h/${hid(id)}/details`).then(
        (d) => {
          setData(d);
          setError(null);
        },
        (e: Error) => setError(e.message),
      ),
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // While the AI reads the page in the background, check back every few seconds.
  useEffect(() => {
    if (!data?.building) return;
    const t = setTimeout(() => void load(), 4000);
    return () => clearTimeout(t);
  }, [data, load]);

  const refresh = async () => {
    setData((d) => (d ? { ...d, building: true } : d));
    await call(`/api/h/${hid(id)}/details`, "POST");
    void load();
  };

  if (error) {
    return (
      <EmptyState level={1} icon={<CircleX />} title="Couldn't open this hackathon" action={<Link href="/" className="btn">Back to Discover</Link>}>
        {error}
      </EmptyState>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading hackathon">
        <div className="flex gap-4">
          <Skeleton className="size-16 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-9" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-main-side">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const h = data.hackathon;
  const isTracked = trackedIds.has(id);
  const status = tracked.find((t) => t.hackathonId === id)?.status;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {h.image && <img src={h.image} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="page-title break-words">{h.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <AttendBadge mode={h.mode} />
            <span>
              {fmtRange(h)}
              {h.mode !== "online" && ` · ${place(h)}`} · {SOURCE_LABELS[h.source]}
              {h.organizer && ` · ${h.organizer}`}
            </span>
          </p>
          {h.prizeText && <p className="mt-1 flex items-center gap-1.5 text-sm text-ok"><Trophy aria-hidden className="size-4 shrink-0" /> {h.prizeText}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={h.url} target="_blank" rel="noreferrer" className="btn">Open page ↗</a>
          {isTracked ? (
            <>
              <Link href={status === "results" ? "/results" : "/tracker"} className="btn border-ok/40 bg-ok-soft text-ok">
                <Check aria-hidden className="size-4" /> {STATUSES.find((s) => s.key === status)?.label ?? "Tracking"}
              </Link>
              <button
                className="btn"
                title="Remove from tracker"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Unpin this hackathon?",
                    body: `${h.title} leaves your board and calendar, along with its deadlines and notes. Ideas, pitches and checks here stay saved.`,
                    confirmLabel: "Unpin",
                  });
                  if (ok) void untrack(id);
                }}
              >
                <PinOff aria-hidden className="size-4" /> Unpin
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => track(id)}><Pin aria-hidden className="size-4" /> Pin to tracker</button>
          )}
        </div>
      </header>

      <ToolStrip
        active={tab}
        section={section}
        onGo={(t, s) => {
          go(t, s);
          scrollToTool();
        }}
      />

      {/* scroll-mt clears the sticky nav when choosing a tool scrolls it into view. */}
      <div ref={tabsRef} className="scroll-mt-20 space-y-4 border-t-(length:--line) border-border pt-4">
        <h2 className="text-lg font-bold">{toolTitle(tab, section)}</h2>
        {tab === "overview" && <OverviewTab data={data} onRefresh={refresh} />}
        {tab === "ask" && <AskTab id={id} data={data} />}
        {tab === "ideas" && <IdeasTab id={id} />}
        {tab === "team" && <TeamTab id={id} data={data} />}
        {tab === "project" && <div className="mx-auto max-w-3xl"><ProjectCard id={id} standalone /></div>}
        {tab === "pitch" && <PitchTab id={id} section={section} onOpenProject={() => go("project")} />}
        {tab === "submit" && <SubmitTab id={id} onOpenProject={() => go("project")} />}
        {tab === "standups" && <StandupsTab id={id} />}
        {tab === "wrapup" && <WrapUpTab id={id} />}
      </div>
    </div>
  );
}

const isOn = (t: HackathonTool, tab: Tab, section: PitchSection) => tab === t.tab && (t.tab !== "pitch" || t.section === section);

/** Heading for whatever is open, so the content says what it is without a separate tab row. */
function toolTitle(tab: Tab, section: PitchSection) {
  return TOOLS.find((t) => isOn(t, tab, section))?.label ?? "";
}

/**
 * "What you can do here": the page's only navigation. Every section and Pitch tool is a tile, grouped by
 * stage. On phones each group scrolls sideways so the panel stays short.
 */
function ToolStrip({ active, section, onGo }: { active: Tab; section: PitchSection; onGo: (t: Tab, s?: PitchSection) => void }) {
  return (
    <nav aria-label="What you can do here" className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wider">What you can do here</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TOOL_GROUPS.map((g) => (
          <div key={g.label} className="min-w-0">
            <h3 className="mb-1.5 text-2xs font-bold uppercase tracking-wider text-muted">{g.label}</h3>
            <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5 sm:flex-col sm:overflow-visible">
              {g.tools.map((t) => {
                const on = isOn(t, active, section);
                return (
                  <li key={t.key} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => onGo(t.tab, t.section)}
                      aria-current={on ? "page" : undefined}
                      // Narrow enough on phones that the next tile peeks in, so the row reads as scrollable.
                      className={`flex w-38 items-center gap-2 rounded-xl border-(length:--line) border-border px-2 py-1.5 text-left transition-[transform,box-shadow] duration-(--dur-fast) sm:w-full ${
                        on ? "bg-accent text-accent-text shadow-none" : "bg-surface shadow-hard-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-hard"
                      }`}
                    >
                      <span className={`grid size-7 shrink-0 place-items-center rounded-lg border-(length:--line) border-border ${on ? "bg-surface text-text" : "bg-warn-soft"}`}>
                        <t.Icon aria-hidden className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold leading-tight">{t.label}</span>
                        <span className={`block truncate text-2xs leading-snug ${on ? "opacity-85" : "text-muted"}`}>{t.blurb}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
