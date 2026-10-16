import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The empty state. A quiet, ruled box — not an illustration. */
export function EmptyState({
  title,
  hint,
  action,
  className,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-1 text-ink-3" aria-hidden>
          {icon}
        </span>
      ) : null}
      <p className="font-display text-[13.5px] font-medium text-ink">{title}</p>
      {hint ? <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  hint,
  className,
}: {
  title?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-st-critical/35 bg-st-critical-wash px-4 py-3",
        className,
      )}
    >
      <p className="font-display text-[13px] font-semibold text-st-critical">{title}</p>
      {hint ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{hint}</p> : null}
    </div>
  );
}

/** A skeleton shaped like the content it replaces — never a spinner. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[6px] bg-surface-3", className)}
    />
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2 p-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
