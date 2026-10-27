"use client";

import { RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { HackathonCard } from "@/components/HackathonCard";
import { useHackmate } from "@/components/HackmateProvider";
import { Segmented } from "@/components/ui/Tabs";
import { clashesWithTracked } from "@/lib/clashes";
import { relative } from "@/lib/format";
import { THEMES } from "@/lib/themes";
import type { Hackathon, Mode, Source } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[360px] animate-pulse rounded-xl bg-surface-2" />,
});

const PRIZE_OPTIONS = [
  { value: 0, label: "Any prize" },
  { value: 1, label: "Has cash prize" },
  { value: 1000, label: "$1k+" },
  { value: 5000, label: "$5k+" },
  { value: 10000, label: "$10k+" },
];

const WHEN_OPTIONS = [
  { value: "any", label: "Any time" },
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
  { value: "reg", label: "Registration open" },
] as const;

type When = (typeof WHEN_OPTIONS)[number]["value"];
type Sort = "soonest" | "prize" | "regClosing";
type View = "split" | "list" | "map";

const VIEWS: { key: View; label: string }[] = [
  { key: "split", label: "Split" },
  { key: "list", label: "List" },
  { key: "map", label: "Map" },
];

function startOf(h: Hackathon) {
  return new Date(h.startsAt ?? h.endsAt ?? 0).getTime();
}

export function DiscoverView() {
  const { hackathons, tracked, trackedIds, now, loading, syncing, lastSync, syncNow, track, untrack } = useHackmate();

  const [q, setQ] = useState("");
  const [sources, setSources] = useState<Set<Source>>(new Set());
  const [mode, setMode] = useState<Mode | "all">("all");
  const [city, setCity] = useState("");
  const [themes, setThemes] = useState<Set<string>>(new Set());
  const [minPrize, setMinPrize] = useState(0);
  const [freeOnly, setFreeOnly] = useState(false);
  const [when, setWhen] = useState<When>("any");
  const [hideClashing, setHideClashing] = useState(false);
  const [sort, setSort] = useState<Sort>("soonest");
  const [view, setView] = useState<View>("split");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hackathons) if (h.city && h.mode !== "online") counts.set(h.city, (counts.get(h.city) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [hackathons]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = hackathons.filter((h) => {
      if (h.endsAt && new Date(h.endsAt).getTime() < now && !trackedIds.has(h.id)) return false;
      if (needle && !`${h.title} ${h.tagline ?? ""} ${h.organizer ?? ""} ${h.city ?? ""}`.toLowerCase().includes(needle)) return false;
      if (sources.size && !sources.has(h.source)) return false;
      if (mode !== "all" && h.mode !== mode) return false;
      if (city && h.city !== city) return false;
      if (themes.size && !h.themes.some((t) => themes.has(t))) return false;
      if (minPrize && (h.prizeUsd ?? 0) < minPrize) return false;
      if (freeOnly && h.entryFee === "paid") return false;
      if (when === "reg" && !(h.regEndsAt && new Date(h.regEndsAt).getTime() > now)) return false;
      if (when === "7" || when === "30") {
        const limit = now + Number(when) * 86_400_000;
        if (startOf(h) > limit) return false;
      }
      if (hideClashing && !trackedIds.has(h.id) && clashesWithTracked(h, tracked).length) return false;
      return true;
    });
    const regTime = (h: Hackathon) => (h.regEndsAt ? new Date(h.regEndsAt).getTime() : Infinity);
    return list.sort((a, b) =>
      sort === "prize"
        ? (b.prizeUsd ?? 0) - (a.prizeUsd ?? 0)
        : sort === "regClosing"
          ? regTime(a) - regTime(b)
          : startOf(a) - startOf(b),
    );
  }, [hackathons, tracked, trackedIds, now, q, sources, mode, city, themes, minPrize, freeOnly, when, hideClashing, sort]);

  const toggle = <T,>(set: Set<T>, value: T, update: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    update(next);
  };

  const activeFilters =
    (q ? 1 : 0) + sources.size + (mode !== "all" ? 1 : 0) + (city ? 1 : 0) + themes.size + (minPrize ? 1 : 0) +
    (freeOnly ? 1 : 0) + (when !== "any" ? 1 : 0) + (hideClashing ? 1 : 0);

  const reset = () => {
    setQ(""); setSources(new Set()); setMode("all"); setCity(""); setThemes(new Set());
    setMinPrize(0); setFreeOnly(false); setWhen("any"); setHideClashing(false);
  };

  const failed = lastSync ? Object.entries(lastSync.sources).filter(([, s]) => !s.ok) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discover hackathons</h1>
          <p className="text-sm text-muted">
            {loading ? "Pulling feeds from Unstop, Devfolio, MLH and WeMakeDevs…" : `${filtered.length} of ${hackathons.length} upcoming`}
            {lastSync && ` · updated ${relative(lastSync.at)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Segmented options={VIEWS} value={view} onChange={setView} label="Layout" />
          <button className="btn" onClick={syncNow} disabled={syncing}>
            <RefreshCw aria-hidden className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Refresh feeds"}
          </button>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Couldn&apos;t reach {failed.map(([s]) => SOURCE_LABELS[s as Source]).join(", ")} on the last refresh. Showing the last data we have.
        </div>
      )}

      {/* Filters */}
      <section className="card space-y-3 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input className="input lg:col-span-2" placeholder="Search name, organizer, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as Mode | "all")}>
            <option value="all">Online + offline</option>
            <option value="online">Online only</option>
            <option value="offline">In person only</option>
            <option value="hybrid">Hybrid only</option>
          </select>
          <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Any city</option>
            {cities.map(([c, n]) => (
              <option key={c} value={c}>{c} ({n})</option>
            ))}
          </select>
          <select className="input" value={minPrize} onChange={(e) => setMinPrize(Number(e.target.value))}>
            {PRIZE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select className="input" value={when} onChange={(e) => setWhen(e.target.value as When)}>
            {WHEN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => toggle(themes, t, setThemes)}
              className={`chip ${themes.has(t) ? "chip-on" : "hover:text-text"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
              <button
                key={s}
                onClick={() => toggle(sources, s, setSources)}
                className={`chip ${sources.has(s) ? "chip-on" : "hover:text-text"}`}
              >
                {SOURCE_LABELS[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free entry only
          </label>
          <label className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={hideClashing} onChange={(e) => setHideClashing(e.target.checked)} /> Hide ones that clash with my tracker
          </label>
          <div className="ml-auto flex items-center gap-2">
            {activeFilters > 0 && (
              <button className="text-xs text-accent hover:underline" onClick={reset}>Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}</button>
            )}
            <select className="input w-auto py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="soonest">Sort: soonest</option>
              <option value="regClosing">Sort: registration closing</option>
              <option value="prize">Sort: biggest prize</option>
            </select>
          </div>
        </div>
      </section>

      {/* Results */}
      <div className={view === "split" ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}>
        {view !== "map" && (
          <div className="space-y-2">
            {loading &&
              Array.from({ length: 6 }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />)}
            {!loading && filtered.length === 0 && (
              <div className="card p-8 text-center text-sm text-muted">No hackathons match these filters.</div>
            )}
            {filtered.slice(0, 200).map((h) => (
              <HackathonCard
                key={h.id}
                h={h}
                tracked={trackedIds.has(h.id)}
                clashesWith={trackedIds.has(h.id) ? [] : clashesWithTracked(h, tracked)}
                selected={selectedId === h.id}
                onSelect={view === "split" ? () => setSelectedId(h.id) : undefined}
                onTrack={() => track(h.id)}
                onUntrack={() => untrack(h.id)}
              />
            ))}
            {filtered.length > 200 && <p className="text-center text-sm text-muted">Showing the first 200 — narrow the filters to see more.</p>}
          </div>
        )}
        {view !== "list" && (
          <div className={view === "split" ? "lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]" : "h-[calc(100vh-14rem)]"}>
            {mode === "online" ? (
              <div className="card grid h-full min-h-[200px] place-items-center p-6 text-sm text-muted">Online hackathons don&apos;t have a location to map.</div>
            ) : (
              <MapView
                hackathons={filtered.filter((h) => h.mode !== "online")}
                trackedIds={trackedIds}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  document.getElementById(`h-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
