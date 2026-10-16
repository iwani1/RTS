import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Paged navigation for long tables.
 *
 * A server component that renders links, not buttons: every page is a real
 * URL, so a page of results can be bookmarked, shared and printed, and the
 * browser's back button behaves the way people expect.
 */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** The path the links point at, e.g. "/trips". */
  basePath: string;
  /** The other query parameters to preserve, e.g. the active filters. */
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  if (pages <= 1) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    search.set("page", String(target));
    return `${basePath}?${search.toString()}`;
  };

  const numbers: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  for (let i = Math.max(1, start); i <= end; i += 1) numbers.push(i);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3",
        className,
      )}
    >
      <p className="numeric text-[11.5px] text-ink-3">
        {from}–{to} of {total}
      </p>

      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            rel="prev"
            className="inline-flex h-7 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Previous
          </Link>
        ) : (
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] text-ink-3 opacity-50">
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            Previous
          </span>
        )}

        {numbers.map((value) => (
          <Link
            key={value}
            href={href(value)}
            aria-current={value === page ? "page" : undefined}
            className={cn(
              "numeric inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] transition-colors",
              value === page
                ? "bg-signal text-signal-ink"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {value}
          </Link>
        ))}

        {page < pages ? (
          <Link
            href={href(page + 1)}
            rel="next"
            className="inline-flex h-7 items-center gap-1 rounded-full border border-line-strong px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        ) : (
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] text-ink-3 opacity-50">
            Next
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </span>
        )}
      </div>
    </nav>
  );
}

/**
 * Read a page number from a search-parameter bag, clamped to a sane range.
 */
export function readPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}
