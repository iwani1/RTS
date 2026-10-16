import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A panel is a hairline-bordered surface. Depth comes from tonal stepping and
 * a 1px inset highlight — never from a drop shadow.
 */
export function Panel({
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
  as: Tag = "section",
}: {
  title?: ReactNode;
  eyebrow?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("surface overflow-hidden rounded-[8px]", className)}>
      {title || actions || eyebrow ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
            {title ? (
              <h2 className="font-display text-[14px] font-semibold tracking-[-0.01em] text-ink">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className={cn(padded ? "p-4" : "", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** A page heading with an optional eyebrow, subtitle and action cluster. */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 border-b border-line pb-5 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink md:text-[30px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** A grid of panels with a consistent gutter. */
export function PanelGrid({
  children,
  className,
  cols = 3,
}: {
  children: ReactNode;
  className?: string;
  cols?: 2 | 3 | 4;
}) {
  const map = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  } as const;
  return (
    <div className={cn("grid gap-4", map[cols], className)}>{children}</div>
  );
}
