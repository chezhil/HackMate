"use client";

import { Link2, MapPinned, RefreshCw, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { HackathonCard } from "@/components/HackathonCard";
import { useHackmate } from "@/components/HackmateProvider";
import type { MapBounds } from "@/components/MapView";
import { AddHackathonDialog } from "@/components/AddHackathonDialog";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Banner, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { ChipToggle } from "@/components/ui/Form";
import { Segmented } from "@/components/ui/Tabs";
import { clashesWithTracked } from "@/lib/clashes";
import { relative } from "@/lib/format";
import { THEMES } from "@/lib/themes";
import type { Hackathon, Source } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";
import {
  activeFilters, clearAll, filtersToQuery, LENGTH_OPTIONS, matches, MODE_OPTIONS, parseFilters, PRIZE_OPTIONS,
  sortHackathons, WHEN_OPTIONS, type Filters, type Sort, type View,
} from "./discoverFilters";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-[360px]" />,
});

const VIEWS: { key: View; label: string }[] = [
  { key: "split", label: "Split" },
  { key: "list", label: "List" },
  { key: "map", label: "Map" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "soonest", label: "Soonest first" },
  { value: "regClosing", label: "Registration closing" },
  { value: "prize", label: "Biggest prize" },
];

const LIST_CAP = 200;

const inBounds = (h: Hackathon, b: MapBounds) =>
  h.lat != null && h.lng != null && h.lat >= b.south && h.lat <= b.north && h.lng >= b.west && h.lng <= b.east;

export function DiscoverView() {
  const { hackathons, tracked, trackedIds, now, loading, syncing, lastSync, error, refresh, syncNow, track, untrack } = useHackmate();
  const params = useSearchParams();
  const f = parseFilters(new URLSearchParams(params.toString()));
  const setF = (next: Filters | ((current: Filters) => Filters)) => {
    const value = typeof next === "function" ? next(parseFilters(new URLSearchParams(window.location.search))) : next;
    const qs = filtersToQuery(value);
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [searchInMap, setSearchInMap] = useState(false);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));

  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of hackathons) if (h.city && h.mode !== "online") counts.set(h.city, (counts.get(h.city) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [hackathons]);

  const filtered = useMemo(() => {
    const list = hackathons.filter((h) => {
      if (h.endsAt && new Date(h.endsAt).getTime() < now && !trackedIds.has(h.id)) return false;
      if (!matches(h, f, now)) return false;
      if (f.hideClashing && !trackedIds.has(h.id) && clashesWithTracked(h, tracked).length) return false;
      return true;
    });
    return sortHackathons(list, f.sort);
  }, [hackathons, tracked, trackedIds, now, f]);

  // "Search as I move the map" narrows the list to what's in view; the map itself keeps every match.
  const mapOn = f.view !== "list";
  const shown = searchInMap && mapOn && bounds ? filtered.filter((h) => inBounds(h, bounds)) : filtered;
  const chips = activeFilters(f);
  const failed = lastSync ? Object.entries(lastSync.sources).filter(([, s]) => !s.ok) : [];
  const feedsDown = !loading && hackathons.length === 0 && error;

  const panel = <FilterPanel f={f} set={set} cities={cities} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">Discover hackathons</h1>
          <p className="text-sm text-muted" aria-live="polite">
            {loading ? "Pulling hackathon feeds…" : `${shown.length} of ${hackathons.length} upcoming`}
            {lastSync && ` · updated ${relative(lastSync.at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* For hackathons that aren't in any feed, or are already over. */}
          <Button onClick={() => setAddOpen(true)} icon={<Link2 aria-hidden className="size-4" />}>Add from link</Button>
          <Button onClick={syncNow} disabled={syncing} icon={<RefreshCw aria-hidden className={`size-4 ${syncing ? "animate-spin" : ""}`} />}>
            {syncing ? "Syncing…" : "Refresh feeds"}
          </Button>
        </div>
      </div>
      <AddHackathonDialog open={addOpen} onClose={() => setAddOpen(false)} />

      {failed.length > 0 && (
        <Banner tone="warn">
          Couldn&apos;t reach {failed.map(([s]) => SOURCE_LABELS[s as Source]).join(", ")} on the last refresh. Showing the last data we have.
        </Banner>
      )}
      {feedsDown && (
        <Banner tone="danger" action={<Button size="sm" onClick={() => void refresh()}>Try again</Button>}>
          Couldn&apos;t load hackathons: {error}
        </Banner>
      )}

      {/* Search stays in reach on every screen size; the rest of the filters fold into a sheet on phones. */}
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search hackathons</span>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-8" type="search" placeholder="Search name, organizer, city…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <Button className="md:hidden" onClick={() => setSheetOpen(true)} icon={<SlidersHorizontal aria-hidden className="size-4" />}>
          Filters{chips.filter((c) => c.key !== "q").length ? ` · ${chips.filter((c) => c.key !== "q").length}` : ""}
        </Button>
      </div>
      <section className="card hidden p-3 md:block" aria-label="Filters">{panel}</section>
      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        footer={
          <>
            <Button variant="ghost" onClick={() => setF(clearAll(f))}>Clear all</Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>Show {filtered.length} hackathon{filtered.length === 1 ? "" : "s"}</Button>
          </>
        }
      >
        {panel}
      </Dialog>

      <div className="flex flex-wrap items-center gap-2">
        {chips.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" className="chip chip-on hover:bg-accent hover:text-accent-text" onClick={() => setF(c.clear(f))} aria-label={`Remove filter ${c.label}`}>
                  {c.label} <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
            <li><button type="button" className="text-xs text-accent hover:underline" onClick={() => setF(clearAll(f))}>Clear all</button></li>
          </ul>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted">
            <span className="sr-only">Sort by</span>
            <select className="input w-auto py-1 text-xs" value={f.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <Segmented options={VIEWS} value={f.view} onChange={(view) => set({ view })} label="Layout" />
        </div>
      </div>

      <div className={f.view === "split" ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : ""}>
        {f.view !== "map" && (
          <div className="space-y-2">
            {loading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} />)}
            {!loading && !feedsDown && shown.length === 0 && (
              searchInMap && mapOn && filtered.length > 0 ? (
                <EmptyState icon={<MapPinned />} title="Nothing in this part of the map" action={<Button onClick={() => setSearchInMap(false)}>Show results everywhere</Button>}>
                  Zoom out or move the map, or stop limiting results to the map view.
                </EmptyState>
              ) : (
                <EmptyState icon={<SearchX />} title="No hackathons match" action={chips.length > 0 && <Button variant="primary" onClick={() => setF(clearAll(f))}>Clear all filters</Button>}>
                  {chips.length > 0 ? "Try removing a filter or two." : "No upcoming hackathons in the feeds right now. Refresh to check again."}
                </EmptyState>
              )
            )}
            {shown.slice(0, LIST_CAP).map((h) => (
              <HackathonCard
                key={h.id}
                h={h}
                tracked={trackedIds.has(h.id)}
                clashesWith={trackedIds.has(h.id) ? [] : clashesWithTracked(h, tracked)}
                selected={selectedId === h.id}
                highlighted={hoverId === h.id}
                onSelect={mapOn ? () => setSelectedId(h.id) : undefined}
                onHover={mapOn ? setHoverId : undefined}
                onTrack={() => track(h.id)}
                onUntrack={() => untrack(h.id)}
              />
            ))}
            {shown.length > LIST_CAP && <p className="text-center text-sm text-muted">Showing the first {LIST_CAP}. Narrow the filters to see the rest.</p>}
          </div>
        )}
        {mapOn && (
          // In split view the map only shows on wide screens; on phones pick Map to see it.
          <div className={f.view === "split" ? "hidden lg:sticky lg:top-20 lg:block lg:h-[calc(100vh-7rem)]" : "h-[calc(100vh-14rem)] min-h-[360px]"}>
            {f.mode === "online" ? (
              <div className="card grid h-full min-h-[200px] place-items-center p-6 text-sm text-muted">Online hackathons don&apos;t have a location to map.</div>
            ) : (
              <MapView
                hackathons={filtered.filter((h) => h.mode !== "online")}
                trackedIds={trackedIds}
                selectedId={selectedId}
                hoverId={hoverId}
                onHover={setHoverId}
                searchInMap={searchInMap}
                onSearchInMap={setSearchInMap}
                onBoundsChange={setBounds}
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

function FilterPanel({ f, set, cities }: { f: Filters; set: (p: Partial<Filters>) => void; cities: [string, number][] }) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Select label="Format" value={f.mode} onChange={(v) => set({ mode: v as Filters["mode"] })} options={MODE_OPTIONS} />
        <Select
          label="City"
          value={f.city}
          onChange={(city) => set({ city })}
          options={[{ value: "", label: "Any city" }, ...cities.map(([c, n]) => ({ value: c, label: `${c} (${n})` }))]}
        />
        <Select label="Prize" value={String(f.minPrize)} onChange={(v) => set({ minPrize: Number(v) })} options={PRIZE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} />
        <Select label="When" value={f.when} onChange={(v) => set({ when: v as Filters["when"] })} options={WHEN_OPTIONS} />
        <Select label="Length" value={f.length} onChange={(v) => set({ length: v as Filters["length"] })} options={LENGTH_OPTIONS} />
      </div>
      <fieldset>
        <legend className="label">Themes</legend>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => <ChipToggle key={t} on={f.themes.includes(t)} onClick={() => set({ themes: toggle(f.themes, t) })}>{t}</ChipToggle>)}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-sm">
        <fieldset>
          <legend className="label">Sources</legend>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
              <ChipToggle key={s} on={f.sources.includes(s)} onClick={() => set({ sources: toggle(f.sources, s) })}>{SOURCE_LABELS[s]}</ChipToggle>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={f.freeOnly} onChange={(e) => set({ freeOnly: e.target.checked })} /> Free entry only
        </label>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={f.hideClashing} onChange={(e) => set({ hideClashing: e.target.checked })} /> Hide ones that clash with my tracker
        </label>
      </div>
    </div>
  );
}

function Select<V extends string>({ label, value, onChange, options }: { label: string; value: V; onChange: (v: V) => void; options: { value: V; label: string }[] }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
