"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { cssVar } from "@/components/ui/tone";
import { fmtRange, place } from "@/lib/format";
import type { Hackathon } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

// Leaflet is driven directly rather than through react-leaflet: Next keeps visited pages alive and
// re-runs their effects when you come back, and react-leaflet can't re-attach to its old container.
// Here every effect run builds the map in a brand-new element and fully tears it down on cleanup.

const COLORS = { tracked: "var(--ok)", hybrid: "var(--warn)", offline: "var(--accent)" };

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Hackathons in the same city share coordinates; nudge them apart so every marker is clickable. */
function spread(list: Hackathon[]) {
  const seen = new Map<string, number>();
  return list.map((h) => {
    const k = `${h.lat},${h.lng}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const angle = n * 2.4;
    const r = n === 0 ? 0 : 0.012 * Math.sqrt(n);
    return { h, pos: [h.lat! + r * Math.sin(angle), h.lng! + r * Math.cos(angle)] as [number, number] };
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function popupHtml(h: Hackathon) {
  return `<div style="font-size:13px;line-height:1.4">
    <div style="font-weight:600">${esc(h.title)}</div>
    <div>${esc(place(h))} · ${esc(fmtRange(h))}</div>
    <div style="opacity:.7;font-size:12px">${SOURCE_LABELS[h.source]} · ${h.mode}${h.prizeText ? ` · ${esc(h.prizeText)}` : ""}</div>
    <a href="/hackathon/${encodeURIComponent(h.id)}">Details</a> · <a href="${esc(h.url)}" target="_blank" rel="noreferrer">Open page ↗</a>
  </div>`;
}

const RADIUS = { base: 7, hover: 9, selected: 10 };

export default function MapView({
  hackathons,
  trackedIds,
  selectedId,
  hoverId,
  onSelect,
  onHover,
  searchInMap = false,
  onSearchInMap,
  onBoundsChange,
}: {
  hackathons: Hackathon[];
  trackedIds: Set<string>;
  selectedId?: string | null;
  hoverId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** When on, the map stops re-fitting to the results and reports its bounds as you pan and zoom. */
  searchInMap?: boolean;
  onSearchInMap?: (on: boolean) => void;
  onBoundsChange?: (b: MapBounds | null) => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const cb = useRef({ onSelect, onHover, onBoundsChange, searchInMap });
  useEffect(() => {
    cb.current = { onSelect, onHover, onBoundsChange, searchInMap };
  }, [onSelect, onHover, onBoundsChange, searchInMap]);

  // Create the map (fresh element each time the component is shown).
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    wrapper.current!.prepend(el);
    const m = L.map(el, { worldCopyJump: true, scrollWheelZoom: true }).setView([20, 78], 3);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const report = () => {
      if (!cb.current.searchInMap) return;
      const b = m.getBounds();
      cb.current.onBoundsChange?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    };
    m.on("moveend", report);
    const live = markers.current;
    return () => {
      m.off("moveend", report);
      m.remove();
      el.remove();
      map.current = null;
      layer.current = null;
      live.clear();
    };
  }, []);

  // Turning "search as I move" on reports the current view at once; turning it off clears it.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!searchInMap) {
      cb.current.onBoundsChange?.(null);
      return;
    }
    const b = m.getBounds();
    cb.current.onBoundsChange?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
  }, [searchInMap]);

  const located = hackathons.filter((h) => h.lat != null && h.lng != null);
  const key = located.map((h) => `${h.id}${trackedIds.has(h.id) ? "+" : ""}`).join("|");

  // Runs after the map effect above (effects run in order), so the map exists here.
  // Rebuild markers when the set of hackathons changes; re-fit the view unless the user is steering it.
  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    markers.current.clear();
    const placed = spread(located);
    // Leaflet writes SVG attributes, which can't hold var(), so resolve the theme tokens here.
    const pin = { tracked: cssVar("ok"), hybrid: cssVar("warn"), offline: cssVar("accent") };
    for (const { h, pos } of placed) {
      const marker = L.circleMarker(pos, {
        radius: RADIUS.base,
        color: cssVar("surface"),
        weight: 2,
        fillColor: trackedIds.has(h.id) ? pin.tracked : h.mode === "hybrid" ? pin.hybrid : pin.offline,
        fillOpacity: 0.9,
      })
        .bindPopup(popupHtml(h))
        .on("click", () => cb.current.onSelect?.(h.id))
        .on("mouseover", () => cb.current.onHover?.(h.id))
        .on("mouseout", () => cb.current.onHover?.(null))
        .addTo(group);
      markers.current.set(h.id, marker);
    }
    if (!cb.current.searchInMap) {
      if (placed.length === 1) m.setView(placed[0].pos, 9);
      else if (placed.length > 1) m.fitBounds(placed.map((x) => x.pos), { padding: [30, 30], maxZoom: 9 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the marker set
  }, [key]);

  // Hover and selection only restyle markers; the view stays where the user left it.
  useEffect(() => {
    const ring = cssVar("text");
    const edge = cssVar("surface");
    for (const [id, marker] of markers.current) {
      const on = id === selectedId || id === hoverId;
      marker.setRadius(id === selectedId ? RADIUS.selected : id === hoverId ? RADIUS.hover : RADIUS.base);
      marker.setStyle({ color: on ? ring : edge, weight: on ? 3 : 2 });
      if (on) marker.bringToFront();
    }
  }, [selectedId, hoverId, key]);

  return (
    <div ref={wrapper} className="relative h-full min-h-[360px] overflow-hidden rounded-xl border border-border">
      {onSearchInMap && (
        <label className="absolute left-1/2 top-2 z-[500] flex -translate-x-1/2 cursor-pointer items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium shadow-pop">
          <input type="checkbox" checked={searchInMap} onChange={(e) => onSearchInMap(e.target.checked)} />
          Search as I move the map
        </label>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] flex flex-wrap gap-3 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs text-muted shadow-pop">
        <Legend color={COLORS.offline} label="In person" />
        <Legend color={COLORS.hybrid} label="Hybrid" />
        <Legend color={COLORS.tracked} label="Tracking" />
        <span>{located.length}/{hackathons.length} on map</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
