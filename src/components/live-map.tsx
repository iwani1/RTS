"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  kind: "vehicle" | "stop" | "office" | "incident";
  tone?: "teal" | "navy" | "amber" | "rose" | "signal";
  /** Monospace ETA shown under the label. */
  eta?: string;
  /** Bearing in degrees, for vehicle markers. */
  heading?: number;
};

/** Greater Accra service area. */
const BOUNDS = { minLat: 5.45, maxLat: 5.8, minLng: -0.45, maxLng: 0.05 };

function project(p: { lat: number; lng: number }) {
  const x = ((p.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - p.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}

const MARKER_FILL: Record<string, string> = {
  teal: "var(--st-live)",
  navy: "var(--st-scheduled)",
  amber: "var(--st-caution)",
  rose: "var(--st-critical)",
  signal: "var(--signal)",
};

/**
 * A lightweight vector map of the Greater Accra service area.
 *
 * This is a *demo* renderer — a stylised lattice, not a survey-accurate
 * basemap. Set NEXT_PUBLIC_MAP_PROVIDER (mapbox | google) plus the matching
 * key to swap in a real provider; see docs/API.md.
 */
export function MapCanvas({
  points,
  height = 360,
  className,
  showGrid = true,
}: {
  points: MapPoint[];
  height?: number;
  className?: string;
  showGrid?: boolean;
}) {
  const vehicles = useMemo(
    () => points.filter((p) => p.kind === "vehicle"),
    [points],
  );

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[8px] border border-line bg-surface-2",
        className,
      )}
      style={{ height }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* water body */}
        <path
          d="M0,84 C12,78 22,86 34,80 C46,74 52,82 64,76 C76,70 88,78 100,72 L100,100 L0,100 Z"
          fill="var(--surface-3)"
          opacity="0.65"
        />
        {/* arterial lattice */}
        <g stroke="var(--line)" strokeWidth="0.4" opacity="0.9">
          <line x1="0" y1="52" x2="100" y2="46" />
          <line x1="26" y1="0" x2="34" y2="100" />
          <line x1="62" y1="0" x2="58" y2="100" />
          <line x1="0" y1="70" x2="100" y2="66" />
          <line x1="84" y1="0" x2="78" y2="100" />
        </g>
        {showGrid ? (
          <g stroke="var(--line)" strokeWidth="0.22" opacity="0.45">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1="0" x2="100" y1={i * 12.5} y2={i * 12.5} />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} y1="0" y2="100" x1={i * 12.5} x2={i * 12.5} />
            ))}
          </g>
        ) : null}

        {/* the corridor: a single signal polyline linking the vehicles in order */}
        {vehicles.length > 1 ? (
          <>
            <polyline
              points={vehicles
                .map((p) => {
                  const a = project(p);
                  return `${a.x},${a.y}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--signal)"
              strokeWidth="1.1"
              strokeOpacity="0.18"
              strokeLinejoin="round"
            />
            <polyline
              points={vehicles
                .map((p) => {
                  const a = project(p);
                  return `${a.x},${a.y}`;
                })
                .join(" ")}
              fill="none"
              stroke="var(--signal)"
              strokeWidth="0.42"
              strokeLinejoin="round"
              strokeDasharray="1.6 1.1"
            />
          </>
        ) : null}

        {/* markers */}
        {points.map((p) => {
          const a = project(p);
          const fill = MARKER_FILL[p.tone ?? "teal"] ?? "var(--st-live)";
          const isVehicle = p.kind === "vehicle";
          return (
            <g key={p.id}>
              {isVehicle ? (
                <circle
                  cx={a.x}
                  cy={a.y}
                  r="1.5"
                  fill="none"
                  stroke={fill}
                  strokeWidth="0.3"
                  opacity="0.5"
                >
                  <animate
                    attributeName="r"
                    values="1.2;3.2;1.2"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.55;0;0.55"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
              <circle
                cx={a.x}
                cy={a.y}
                r={isVehicle ? 0.95 : 0.7}
                fill={fill}
                stroke="var(--surface-1)"
                strokeWidth="0.35"
              />
            </g>
          );
        })}
      </svg>

      {/* labels */}
      <div className="pointer-events-none absolute inset-0">
        {points.map((p) => {
          const a = project(p);
          return (
            <div
              key={`lbl-${p.id}`}
              className="absolute -translate-x-1/2 whitespace-nowrap rounded-[4px] border border-line bg-surface-1/92 px-1.5 py-0.5 leading-tight"
              style={{ left: `${a.x}%`, top: `calc(${a.y}% + 7px)` }}
            >
              <span className="block text-[10px] font-medium text-ink">{p.label}</span>
              {p.eta ? (
                <span className="numeric block text-[9.5px] text-ink-3">{p.eta}</span>
              ) : p.sublabel ? (
                <span className="block text-[9.5px] text-ink-3">{p.sublabel}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      <span className="numeric absolute bottom-2 right-2 rounded-[4px] border border-line bg-surface-1/92 px-2 py-0.5 text-[9.5px] text-ink-3">
        Demo vector map · Greater Accra
      </span>
    </div>
  );
}

type LivePayload = { points: MapPoint[]; updatedAt?: string };

/** Polls the dispatch feed and re-renders the map. */
export function LiveMap({
  initial,
  pollUrl,
  className,
}: {
  initial: MapPoint[];
  pollUrl?: string;
  className?: string;
}) {
  const [points, setPoints] = useState<MapPoint[]>(initial);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!pollUrl || !live) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(pollUrl, { cache: "no-store" });
        if (!res.ok) {
          setStale(true);
          return;
        }
        const data = (await res.json()) as LivePayload;
        if (!cancelled && Array.isArray(data.points)) {
          setPoints(data.points);
          setUpdatedAt(new Date().toLocaleTimeString("en-GB"));
          setStale(false);
        }
      } catch {
        /* offline: keep the last known positions and mark the feed stale */
        setStale(true);
      }
    };
    const id = setInterval(load, 15000);
    load();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollUrl, live]);

  const vehicleCount = points.filter((p) => p.kind === "vehicle").length;

  return (
    <div className={className}>
      <MapCanvas points={points} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="numeric text-[11px] text-ink-3">
          {vehicleCount} vehicles · {points.length} markers
          {updatedAt ? ` · refreshed ${updatedAt}` : " · static snapshot"}
          {stale ? " · feed stale" : ""}
        </span>
        {pollUrl ? (
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className={cn(
              "rounded-full border border-line px-2.5 py-1 font-display text-[11.5px] text-ink-2",
              "transition-colors hover:bg-surface-2 hover:text-ink",
            )}
          >
            {live ? "Pause refresh" : "Resume refresh"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
