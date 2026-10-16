import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { statusLabel, TONE_DOT, TONE_PULSES, TONE_RING, TONE_WASH, toneFor, type Tone } from "@/lib/status";

/** A status light. Colour is never the only carrier of meaning. */
export function StatusDot({
  tone,
  className,
}: {
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-[7px] w-[7px] shrink-0 rounded-full",
        TONE_DOT[tone],
        TONE_PULSES[tone] && "pulse-live",
        className,
      )}
    />
  );
}

/** A status chip: dot + word, on a matching wash. */
export function StatusChip({
  status,
  tone,
  label,
  className,
}: {
  status?: string | null;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const resolved = tone ?? toneFor(status);
  const text = label ?? statusLabel(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-medium ring-1 ring-inset ring-transparent",
        TONE_WASH[resolved],
        TONE_RING[resolved],
        className,
      )}
    >
      <StatusDot tone={resolved} />
      {text}
    </span>
  );
}

/** A neutral tag for non-status metadata. */
export function Tag({
  children,
  className,
  tone = "idle",
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-[3px] text-[11.5px] font-medium text-ink-2 ring-1 ring-inset ring-line",
        tone !== "idle" && TONE_WASH[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
