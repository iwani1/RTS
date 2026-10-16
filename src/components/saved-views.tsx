import Link from "next/link";
import { Bookmark, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedView } from "@/lib/views";

/**
 * Saved views.
 *
 * A named set of filters for a list. The chips link to the filtered URL, so
 * a saved view is a real, shareable address rather than hidden state. Saving
 * and deleting use plain form posts to route handlers, so the whole feature
 * works without a script bundle.
 */
export function SavedViewBar({
  views,
  scope,
  basePath,
  returnTo,
  activeName,
}: {
  views: SavedView[];
  scope: string;
  basePath: string;
  /** Where the browser lands after saving or deleting. */
  returnTo: string;
  /** The name of the view the current filters match, if any. */
  activeName?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-3">
        <Bookmark className="h-3.5 w-3.5" strokeWidth={1.5} />
        Views
      </span>

      {views.length === 0 ? (
        <span className="text-[12px] text-ink-3">None saved yet</span>
      ) : (
        views.map((view) => {
          const search = new URLSearchParams(
            Object.entries(view.filters).filter(([, value]) => value),
          );
          const href = search.toString() ? `${basePath}?${search.toString()}` : basePath;
          const active = activeName === view.name;
          return (
            <span
              key={view.id}
              className="inline-flex items-center overflow-hidden rounded-full border border-line-strong"
            >
              <Link
                href={href}
                className={cn(
                  "inline-flex h-7 items-center px-3 text-[12px] transition-colors",
                  active
                    ? "bg-signal/12 text-signal"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {view.name}
              </Link>
              <form method="post" action="/api/views/delete" className="flex">
                <input type="hidden" name="id" value={view.id} />
                <input type="hidden" name="scope" value={scope} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  aria-label={`Delete view ${view.name}`}
                  className="inline-flex h-7 w-7 items-center justify-center border-l border-line-strong text-ink-3 transition-colors hover:bg-surface-2 hover:text-critical"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </form>
            </span>
          );
        })
      )}
    </div>
  );
}

/**
 * The form that saves the current filters under a name.
 *
 * Rendered inline so it sits in the filter panel rather than behind a menu.
 */
export function SaveViewForm({
  scope,
  currentFilters,
  returnTo,
  label = "Save this view",
}: {
  scope: string;
  currentFilters: Record<string, string>;
  returnTo: string;
  label?: string;
}) {
  const active = Object.entries(currentFilters).filter(([, value]) => value);

  return (
    <form method="post" action="/api/views/save" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {active.map(([key, value]) => (
        <input key={key} type="hidden" name={`filter.${key}`} value={value} />
      ))}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`view-name-${scope}`}
          className="font-display text-[12.5px] font-medium text-ink-2"
        >
          View name
        </label>
        <input
          id={`view-name-${scope}`}
          name="name"
          required
          maxLength={80}
          placeholder="Late trips this week"
          className="h-9 w-[220px] rounded-[8px] border border-line-strong bg-surface-1 px-3 text-[13.5px] text-ink placeholder:text-ink-3 focus:border-signal focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="h-9 rounded-full border border-line-strong px-4 font-display text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-2"
      >
        {label}
      </button>
    </form>
  );
}
