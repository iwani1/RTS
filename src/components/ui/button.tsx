"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Actions are pills. Containers are 8px.
 * That single asymmetry does more anti-template work than any colour choice.
 */

type Variant = "signal" | "neutral" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  signal:
    "bg-signal text-signal-ink hover:bg-signal-press active:bg-signal-press font-semibold",
  neutral:
    "bg-surface-3 text-ink border border-line-strong hover:border-ink-3 active:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  outline: "border border-line-strong text-ink hover:bg-surface-2",
  danger: "bg-st-critical/12 text-st-critical border border-st-critical/35 hover:bg-st-critical/20",
};

const SIZE: Record<Size, string> = {
  sm: "h-7 px-3 text-[12.5px] gap-1.5",
  md: "h-9 px-4 text-[13.5px] gap-2",
  lg: "h-11 px-6 text-[15px] gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-full font-display font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,opacity] duration-150 ease-[var(--ease-instrument)] " +
  "disabled:pointer-events-none disabled:opacity-45 select-none";

export function Button({
  variant = "neutral",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "neutral",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2",
        "transition-colors duration-150 hover:bg-surface-2 hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A segmented control — a single choice across a small set of options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full font-display font-medium transition-colors duration-150",
              size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]",
              active
                ? "bg-signal text-signal-ink"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
