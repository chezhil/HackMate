"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { fmtRange, place } from "@/lib/format";
import type { Hackathon } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

// Leaflet is driven directly rather than through react-leaflet: Next keeps visited pages alive and
// re-runs their effects when you come back, and react-leaflet can't re-attach to its old container.
// Here every effect run builds the map in a brand-new element and fully tears it down on cleanup.

type PinKind = "offline" | "hybrid" | "tracked";

/** Pins are HTML stickers styled in globals.css (.hm-pin), so they take theme tokens directly. */
const pinIcon = (kind: PinKind) =>
  L.divIcon({ className: "hm-pin-wrap", html: `<span class="hm-pin hm-pin--${kind}"></span>`, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });

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
  return `<div class="hm-popup">
    <div class="hm-popup-title">${esc(h.title)}</div>
    <div>${esc(place(h))} · ${esc(fmtRange(h))}</div>
    <div class="hm-popup-meta">${SOURCE_LABELS[h.source]} · ${h.mode}${h.prizeText ? ` · ${esc(h.prizeText)}` : ""}</div>
    <div class="hm-popup-links"><a href="/hackathon/${encodeURIComponent(h.id)}">Details</a><a href="${esc(h.url)}" target="_blank" rel="noreferrer">Open page ↗</a></div>
  </div>`;
}

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
  const markers = useRef(new Map<string, L.Marker>());
  const cb = useRef({ onSelect, onHover, onBoundsChange, searchInMap });
  useEffect(() => {
    cb.current = { onSelect, onHover, onBoundsChange, searchInMap };
  }, [onSelect, onHover, onBoundsChange, searchInMap]);

  // Create the map (fresh element each time the component is shown).
  useEffect(() => {
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;inset:0";
    wrapper.current!.prepend(el);
    // Keep the view inside the tiles: no empty band above the Arctic or below Antarctica.
    const m = L.map(el, {
      worldCopyJump: true,
      scrollWheelZoom: true,
      minZoom: 2,
      maxBounds: [[-85, -540], [85, 540]],
      maxBoundsViscosity: 1,
    }).setView([20, 78], 3);
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
    for (const { h, pos } of placed) {
      const kind: PinKind = trackedIds.has(h.id) ? "tracked" : h.mode === "hybrid" ? "hybrid" : "offline";
      // keyboard: false — the cards are the keyboard path; 170 focusable pins would bury the rest of the page.
      const marker = L.marker(pos, { icon: pinIcon(kind), keyboard: false, title: h.title, riseOnHover: true })
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
    for (const [id, marker] of markers.current) {
      const pin = marker.getElement()?.querySelector(".hm-pin");
      pin?.classList.toggle("is-hover", id === hoverId && id !== selectedId);
      pin?.classList.toggle("is-selected", id === selectedId);
      marker.setZIndexOffset(id === selectedId ? 2000 : id === hoverId ? 1000 : 0);
    }
  }, [selectedId, hoverId, key]);

  return (
    <div ref={wrapper} className="hm-map relative h-full min-h-[360px] overflow-hidden rounded-xl border-(length:--line) border-border shadow-hard">
      {onSearchInMap && (
        <label className="absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 cursor-pointer items-center gap-2 rounded-lg border-(length:--line) border-border bg-surface px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-hard-sm">
          <input type="checkbox" checked={searchInMap} onChange={(e) => onSearchInMap(e.target.checked)} />
          Search as I move the map
        </label>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-(length:--line) border-border bg-surface px-2.5 py-1.5 text-xs font-semibold shadow-hard-sm">
        <Legend kind="offline" label="In person" />
        <Legend kind="hybrid" label="Hybrid" />
        <Legend kind="tracked" label="Tracking" />
        <span className="font-normal text-muted">{located.length}/{hackathons.length} on map</span>
      </div>
    </div>
  );
}

function Legend({ kind, label }: { kind: PinKind; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`hm-pin hm-pin--${kind} hm-pin--sm`} aria-hidden />
      {label}
    </span>
  );
}
