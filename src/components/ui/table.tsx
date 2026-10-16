import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tables are the interface, not a chart dashboard. Every list view is a table:
 * sticky header, hairline rules, no vertical borders, right-aligned tabular
 * numerics, hover-revealed row actions.
 */

export function TableWrap({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-full border-collapse text-left text-[13px]">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface-2">
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  className,
  ...props
}: ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({
  children,
  className,
  ...props
}: ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "group transition-colors duration-100 hover:bg-surface-2",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = "left",
  ...props
}: ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle text-ink-2",
        align === "right" && "text-right numeric",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

/** A cell that holds a primary value — the thing you scan the column for. */
export function TDPrimary({ children, className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn("px-3 py-2 align-middle text-[13px] font-medium text-ink", className)}
      {...props}
    >
      {children}
    </td>
  );
}

/** Row actions that appear on hover but stay reachable by keyboard. */
export function RowActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-1 opacity-0 transition-opacity duration-150",
        "group-hover:opacity-100 focus-within:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
