import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_WASH } from "@/lib/status";
import { StatusDot } from "./badge";
import { TONE_DOT } from "@/lib/status";
import type { Tone } from "@/lib/status";

/**
 * A metric tile. One number, one comparison, one visual — never a wall of
 * identical KPI cards. The value is mono and tabular so columns of them align.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone,
  icon,
  className,
  onDark = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div
      className={cn(
        "surface relative overflow-hidden rounded-[8px] px-4 py-3.5",
        onDark && "border-line bg-surface-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow truncate">{label}</p>
        {icon ? (
          <span className="shrink-0 text-ink-3" aria-hidden>
            {icon}
          </span>
        ) : tone ? (
          <StatusDot tone={tone} />
        ) : null}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="numeric text-[24px] font-medium leading-none tracking-[-0.02em] text-ink">
          {value}
        </span>
        {unit ? <span className="text-[12px] text-ink-3">{unit}</span> : null}
      </p>
      {hint ? (
        <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The metric strip. Capped at six numbers — anything more is noise nobody
 * acts on.
 */
export function MetricStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MetricCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="bg-surface-1 px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        {tone ? <StatusDot tone={tone} /> : null}
        <p className="eyebrow truncate">{label}</p>
      </div>
      <p className="mt-1.5 numeric text-[19px] font-medium leading-none text-ink">{value}</p>
      {hint ? <p className="mt-1 text-[11.5px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** A small inline badge that pairs a label with a value. */
export function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {tone ? <StatusDot tone={tone} /> : null}
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <span className="numeric text-[12.5px] font-medium text-ink">{value}</span>
    </span>
  );
}

/** A tinted callout used for demo-mode and limitation notices. */
export function Notice({
  children,
  tone = "caution",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[8px] px-3 py-2.5 text-[12.5px] leading-relaxed ring-1 ring-inset ring-transparent",
        TONE_WASH[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A hairline progress meter. A bar is never a chart — it carries one value
 * against one maximum, and the number is always printed beside it.
 */
export function ProgressBar({
  value,
  tone = "caution",
  className,
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("flex items-center gap-2.5", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", TONE_DOT[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
