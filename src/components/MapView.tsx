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

const COLORS = { tracked: "#16a34a", hybrid: "#d97706", offline: "#4f46e5" };

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

export default function MapView({
  hackathons,
  trackedIds,
  selectedId,
  onSelect,
}: {
  hackathons: Hackathon[];
  trackedIds: Set<string>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
    return () => {
      m.remove();
      el.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  const located = hackathons.filter((h) => h.lat != null && h.lng != null);
  const key = located.map((h) => `${h.id}${trackedIds.has(h.id) ? "+" : ""}`).join("|");

  // Draw markers and fit the view whenever the set of hackathons changes.
  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    const markers = spread(located);
    for (const { h, pos } of markers) {
      L.circleMarker(pos, {
        radius: h.id === selectedId ? 10 : 7,
        color: "#fff",
        weight: 2,
        fillColor: trackedIds.has(h.id) ? COLORS.tracked : h.mode === "hybrid" ? COLORS.hybrid : COLORS.offline,
        fillOpacity: 0.9,
      })
        .bindPopup(popupHtml(h))
        .on("click", () => onSelectRef.current?.(h.id))
        .addTo(group);
    }
    if (markers.length === 1) m.setView(markers[0].pos, 9);
    else if (markers.length > 1) m.fitBounds(markers.map((x) => x.pos), { padding: [30, 30], maxZoom: 9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the marker set
  }, [key, selectedId]);

  return (
    <div ref={wrapper} className="relative h-full min-h-[360px] overflow-hidden rounded-xl border border-border">
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] flex gap-3 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs text-muted shadow">
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
