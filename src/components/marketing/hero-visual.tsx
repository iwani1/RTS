"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The product, not a picture of the product.
 *
 * The marketing hero shows a working slice of the dispatch board: a live
 * corridor being drawn, a real trip row, and the inspector values an operator
 * actually reads. Nothing here is a screenshot, and nothing here is a gradient
 * blob pretending to be a dashboard.
 */

const TRIPS = [
  { ref: "TR-2418", route: "Dansoman → Airport", etd: "07:12", eta: "+00:03", tone: "live" },
  { ref: "TR-2419", route: "Osu → Tema Port", etd: "07:28", eta: "-00:01", tone: "ok" },
  { ref: "TR-2421", route: "Spintex → Ridgeway", etd: "07:40", eta: "+00:07", tone: "caution" },
];

const TONE_CLASS: Record<string, string> = {
  live: "bg-st-live",
  ok: "bg-st-ok",
  caution: "bg-st-caution",
  idle: "bg-st-idle",
};

export function HeroVisual() {
  const [tick, setTick] = useState(0);

  // A slow, honest clock: the board ticks the way a live board does.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 6), 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative">
      {/* The device. A hairline frame, not a drop shadow. */}
      <div className="relative overflow-hidden rounded-[12px] border border-line-strong bg-surface-1">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3.5 py-2.5">
          <span className="h-2 w-2 rounded-full bg-st-idle" />
          <span className="h-2 w-2 rounded-full bg-st-idle" />
          <span className="h-2 w-2 rounded-full bg-st-idle" />
          <span className="numeric ml-2 text-[10.5px] text-ink-3">
            staffride / dispatch
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="h-[6px] w-[6px] rounded-full bg-st-live pulse-live" />
            <span className="text-[10.5px] text-ink-3">live</span>
          </span>
        </div>

        <div className="grid grid-cols-[1fr_1.35fr]">
          {/* Trip board */}
          <div className="border-r border-line">
            <p className="eyebrow border-b border-line px-3 py-2">Trip board</p>
            <ul>
              {TRIPS.map((trip, index) => {
                const active = index === tick % TRIPS.length;
                return (
                  <li
                    key={trip.ref}
                    className={cn(
                      "border-b border-line px-3 py-2.5 transition-colors duration-200",
                      active ? "bg-surface-2" : "bg-surface-1",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="numeric text-[11.5px] font-medium text-ink">
                        {trip.ref}
                      </span>
                      <span
                        className={cn(
                          "h-[6px] w-[6px] rounded-full",
                          TONE_CLASS[trip.tone],
                        )}
                      />
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-ink-2">{trip.route}</p>
                    <p className="numeric mt-1 text-[10.5px] text-ink-3">
                      ETD {trip.etd} · Δ {trip.eta}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Corridor */}
          <div className="relative">
            <svg
              viewBox="0 0 200 220"
              className="h-full w-full"
              role="img"
              aria-label="Live route corridor with three vehicles in motion"
            >
              <defs>
                <pattern id="hero-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M20 0H0V20" fill="none" stroke="var(--line)" strokeWidth="0.5" />
                </pattern>
                <linearGradient id="hero-corridor" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="var(--st-live)" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              <rect width="200" height="220" fill="url(#hero-grid)" />

              {/* The corridor, drawn on mount. */}
              <path
                d="M28 182 C58 168, 52 126, 88 118 S146 96, 168 52"
                fill="none"
                stroke="url(#hero-corridor)"
                strokeWidth="2"
                strokeLinecap="round"
                className="draw-in"
                style={{ ["--dash" as string]: "260" }}
              />

              {/* Pickup stops */}
              {[
                { x: 28, y: 182 },
                { x: 88, y: 118 },
                { x: 168, y: 52 },
              ].map((stop, i) => (
                <g key={i}>
                  <circle cx={stop.x} cy={stop.y} r="7" fill="var(--surface-1)" stroke="var(--line-strong)" />
                  <circle cx={stop.x} cy={stop.y} r="2.4" fill="var(--ink-3)" />
                </g>
              ))}

              {/* Vehicles, offset along the corridor. */}
              {[
                { cx: 54, cy: 152, label: "TR-2418" },
                { cx: 118, cy: 104, label: "TR-2419" },
                { cx: 150, cy: 76, label: "TR-2421" },
              ].map((v, i) => (
                <g key={v.label}>
                  <circle cx={v.cx} cy={v.cy} r="9" fill="var(--signal)" opacity="0.12" />
                  <circle cx={v.cx} cy={v.cy} r="4" fill="var(--signal)" />
                  <text
                    x={v.cx + 9}
                    y={v.cy - 6}
                    fill="var(--text-3)"
                    style={{ font: "8px var(--font-mono, monospace)" }}
                  >
                    {v.label}
                  </text>
                </g>
              ))}
            </svg>

            <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-2 py-1">
              <span className="h-[5px] w-[5px] rounded-full bg-st-live pulse-live" />
              <span className="numeric text-[9.5px] text-ink-3">3 vehicles tracking</span>
            </div>
          </div>
        </div>

        {/* Inspector strip */}
        <div className="grid grid-cols-3 border-t border-line">
          {[
            { label: "On time", value: "94.2%" },
            { label: "Seats sold", value: "1 284" },
            { label: "Open alerts", value: "3" },
          ].map((cell) => (
            <div key={cell.label} className="border-r border-line px-3 py-2 last:border-r-0">
              <p className="eyebrow">{cell.label}</p>
              <p className="numeric mt-1 text-[13px] font-medium text-ink">{cell.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* A quiet annotation, not a floating badge cloud. */}
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-3">
        <span className="h-px w-6 bg-line-strong" />
        The dispatch command centre — every screen in this product is a live
        surface, not a mock-up.
      </p>
    </div>
  );
}

/** The step path used in the "how it works" section. */
export function StepPath({
  steps,
}: {
  steps: Array<{ title: string; body: string }>;
}) {
  return (
    <ol className="relative grid gap-px overflow-hidden rounded-[8px] border border-line bg-line md:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.title} className="bg-surface-1 p-5">
          <p className="numeric text-[11px] text-ink-3">
            {String(index + 1).padStart(2, "0")}
          </p>
          <h3 className="mt-2 font-display text-[14px] font-semibold text-ink">
            {step.title}
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** A link that carries an arrow — used in the footer columns. */
export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-1 text-[12.5px] text-ink-2 transition-colors duration-150 hover:text-ink"
    >
      {children}
      <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
    </a>
  );
}
