"use client";

/**
 * Charts are hand-drawn SVG — no charting dependency, no default styling.
 *
 * Rules from DESIGN.md:
 *  - hairline gridlines, never dotted grid paper
 *  - the series palette is fixed and never reordered
 *  - numbers are mono and tabular so columns align
 *  - a chart always carries its unit and its period
 */
import { cn } from "@/lib/utils";

export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
] as const;

/* -------------------------------------------------------------------------- */

export function BarChart({
  data,
  height = 180,
  valueKey = "value",
  labelKey = "label",
  format,
  tone = "var(--series-1)",
  unit,
  className,
}: {
  data: Array<Record<string, string | number>>;
  height?: number;
  valueKey?: string;
  labelKey?: string;
  format?: (v: number) => string;
  tone?: string;
  unit?: string;
  className?: string;
}) {
  const values = data.map((d) => Number(d[valueKey] ?? 0));
  const max = Math.max(1, ...values);
  const fmt = format ?? ((v: number) => String(v));

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const v = values[i];
          const h = Math.max(2, (v / max) * (height - 26));
          return (
            <div
              key={i}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              title={`${d[labelKey]}: ${fmt(v)}${unit ? ` ${unit}` : ""}`}
            >
              <span className="numeric mb-1 text-[10.5px] text-ink-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {fmt(v)}
              </span>
              <div
                className="w-full rounded-t-[3px] transition-opacity duration-150 group-hover:opacity-100"
                style={{ height: h, backgroundColor: tone, opacity: 0.82 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {data.map((d, i) => (
          <span
            key={i}
            className="numeric flex-1 truncate text-center text-[10px] text-ink-3"
          >
            {String(d[labelKey] ?? "")}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function LineChart({
  series,
  height = 190,
  labels,
  unit,
  className,
}: {
  series: Array<{ name: string; color: string; points: number[] }>;
  height?: number;
  labels: string[];
  unit?: string;
  className?: string;
}) {
  const all = series.flatMap((s) => s.points);
  const max = Math.max(1, ...all);
  const w = 700;
  const h = height;
  const pad = 26;
  const stepX = labels.length > 1 ? (w - pad * 2) / (labels.length - 1) : 0;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label="trend chart"
      >
        {/* hairline gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={pad}
            x2={w - pad}
            y1={y(max * t)}
            y2={y(max * t)}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}

        {series.map((s) => {
          const d = s.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${pad + i * stepX} ${y(p)}`)
            .join(" ");
          return (
            <g key={s.name}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={pad + i * stepX}
                  cy={y(p)}
                  r="2.6"
                  fill="var(--surface-1)"
                  stroke={s.color}
                  strokeWidth="1.6"
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {series.map((s) => (
            <span
              key={s.name}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
        <span className="numeric text-[11px] text-ink-3">
          {labels[0]} → {labels[labels.length - 1]}
          {unit ? ` · ${unit}` : ""}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** A radial gauge. The value is mono; the arc is the only coloured element. */
export function DonutStat({
  value,
  label,
  tone = "var(--series-1)",
  caption,
  className,
}: {
  value: number;
  label: string;
  tone?: string;
  caption?: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("flex items-center gap-3.5", className)}>
      <svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        role="img"
        aria-label={`${label}: ${clamped.toFixed(0)}%`}
      >
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth="9"
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          transform="rotate(-90 48 48)"
        />
        <text
          x="48"
          y="52"
          textAnchor="middle"
          className="numeric"
          fill="var(--text-1)"
          fontSize="17"
          fontWeight="600"
        >
          {clamped.toFixed(0)}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="truncate font-display text-[13px] font-medium text-ink">{label}</p>
        {caption ? (
          <p className="truncate text-[11.5px] text-ink-3">{caption}</p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** An inline trend, no axes, no labels — for table cells and list rows. */
export function Sparkline({
  points,
  color = "var(--series-1)",
  width = 96,
  height = 26,
  className,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!points.length) return null;
  const max = Math.max(1, ...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${y(p)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={(points.length - 1) * stepX} cy={y(points[points.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

/** A horizontal ranked bar list — the default shape for "top N" questions. */
export function RankedBars({
  data,
  valueKey = "value",
  labelKey = "label",
  format,
  unit,
  className,
}: {
  data: Array<Record<string, string | number>>;
  valueKey?: string;
  labelKey?: string;
  format?: (v: number) => string;
  unit?: string;
  className?: string;
}) {
  const values = data.map((d) => Number(d[valueKey] ?? 0));
  const max = Math.max(1, ...values);
  const fmt = format ?? ((v: number) => String(v));

  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {data.map((d, i) => {
        const v = values[i];
        return (
          <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <span className="truncate text-[12.5px] text-ink-2">
              {String(d[labelKey] ?? "")}
            </span>
            <span className="numeric text-[12.5px] text-ink">
              {fmt(v)}
              {unit ? <span className="text-ink-3"> {unit}</span> : null}
            </span>
            <div className="col-span-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(v / max) * 100}%`,
                  backgroundColor: SERIES[i % SERIES.length],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
