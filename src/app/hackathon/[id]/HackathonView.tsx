"use client";

import { Check, CircleX, Pin, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useHackmate } from "@/components/HackmateProvider";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Tabs } from "@/components/ui/Tabs";
import type { RuleAlert } from "@/lib/alerts";
import { call, hid } from "@/lib/client";
import { fmtRange, place } from "@/lib/format";
import type { Hackathon, HackathonDetails } from "@/lib/types";
import { SOURCE_LABELS, STATUSES } from "@/lib/types";
import { AskTab } from "./AskTab";
import { IdeasTab } from "./IdeasTab";
import { OverviewTab } from "./OverviewTab";
import { PitchTab } from "./PitchTab";
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

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "ask", label: "Ask AI" },
  { key: "ideas", label: "Ideas" },
  { key: "team", label: "Team" },
  { key: "pitch", label: "Pitch" },
  { key: "submit", label: "Submit" },
  { key: "standups", label: "Standups" },
  { key: "wrapup", label: "Wrap-up" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const isTab = (v: string | null): v is Tab => TABS.some((t) => t.key === v);

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
  const setTab = (t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    if (t === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };

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
          <p className="text-sm text-muted">
            {fmtRange(h)} · <span className="capitalize">{h.mode}</span>
            {h.mode !== "online" && ` · ${place(h)}`} · {SOURCE_LABELS[h.source]}
            {h.organizer && ` · ${h.organizer}`}
          </p>
          {h.prizeText && <p className="mt-1 flex items-center gap-1.5 text-sm text-ok"><Trophy aria-hidden className="size-4 shrink-0" /> {h.prizeText}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={h.url} target="_blank" rel="noreferrer" className="btn">Open page ↗</a>
          {isTracked ? (
            <>
              <Link href="/tracker" className="btn border-ok/40 bg-ok-soft text-ok">
                <Check aria-hidden className="size-4" /> {STATUSES.find((s) => s.key === status)?.label ?? "Tracking"}
              </Link>
              <button className="btn" onClick={() => untrack(id)} title="Remove from tracker">Unpin</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => track(id)}><Pin aria-hidden className="size-4" /> Pin to tracker</button>
          )}
        </div>
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Hackathon sections" />

      {tab === "overview" && <OverviewTab data={data} onRefresh={refresh} />}
      {tab === "ask" && <AskTab id={id} data={data} />}
      {tab === "ideas" && <IdeasTab id={id} />}
      {tab === "team" && <TeamTab id={id} data={data} />}
      {tab === "pitch" && <PitchTab id={id} />}
      {tab === "submit" && <SubmitTab id={id} />}
      {tab === "standups" && <StandupsTab id={id} />}
      {tab === "wrapup" && <WrapUpTab id={id} />}
    </div>
  );
}
