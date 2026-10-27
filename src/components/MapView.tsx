"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { fmtRange, place } from "@/lib/format";
import type { Hackathon } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 9);
    else map.fitBounds(points, { padding: [30, 30], maxZoom: 9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/** Hackathons at the same city share coordinates; nudge them apart so every marker is clickable. */
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
  const located = hackathons.filter((h) => h.lat != null && h.lng != null);
  const markers = spread(located);
  return (
    <div className="relative h-full min-h-[360px] overflow-hidden rounded-xl border border-border">
      <MapContainer center={[20, 78]} zoom={3} scrollWheelZoom className="h-full w-full" worldCopyJump>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={markers.map((m) => m.pos)} />
        {markers.map(({ h, pos }) => {
          const tracked = trackedIds.has(h.id);
          const selected = h.id === selectedId;
          return (
            <CircleMarker
              key={h.id}
              center={pos}
              radius={selected ? 10 : 7}
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: tracked ? "#16a34a" : h.mode === "hybrid" ? "#d97706" : "#4f46e5",
                fillOpacity: 0.9,
              }}
              eventHandlers={{ click: () => onSelect?.(h.id) }}
            >
              <Popup>
                <div className="space-y-0.5 text-sm">
                  <div className="font-semibold">{h.title}</div>
                  <div>{place(h)} · {fmtRange(h)}</div>
                  <div className="text-xs opacity-70">
                    {SOURCE_LABELS[h.source]} · {h.mode}
                    {h.prizeText ? ` · ${h.prizeText}` : ""}
                  </div>
                  <a href={h.url} target="_blank" rel="noreferrer">Open page ↗</a>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] flex gap-3 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs text-muted shadow">
        <Legend color="#4f46e5" label="In person" />
        <Legend color="#d97706" label="Hybrid" />
        <Legend color="#16a34a" label="Tracking" />
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
