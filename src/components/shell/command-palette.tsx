"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowRight,
  Bus,
  CalendarCheck,
  CornerDownLeft,
  Loader2,
  MapPin,
  Search,
  Truck,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Result = {
  id: string;
  kind: "page" | "trip" | "booking" | "vehicle" | "driver" | "employee";
  label: string;
  context: string;
  href: string;
};

const KIND_ICON: Record<Result["kind"], typeof Search> = {
  page: ArrowRight,
  trip: Bus,
  booking: CalendarCheck,
  vehicle: Truck,
  driver: User,
  employee: User,
};

/**
 * ⌘K. Power users never touch the mouse.
 * Every result carries a mono id, a one-line context and a keyboard path.
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // The body is mounted only while the palette is open, so it always starts
  // with an empty query and no stale results — no reset effect required.
  if (!open) return null;
  return <PaletteBody onClose={onClose} />;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(term)}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { results: Result[] };
        setResults(data.results ?? []);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, search]);

  useEffect(() => {
    const timer = setTimeout(() => void search(query), 160);
    return () => clearTimeout(timer);
  }, [query, search]);

  const run = (result: Result) => {
    onClose();
    router.push(result.href);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <Command
        label="Search the platform"
        className="relative w-full max-w-xl overflow-hidden rounded-[10px] border border-line-strong bg-surface-1 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]"
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) {
            event.preventDefault();
            run(results[0]);
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search className="h-4 w-4 shrink-0 text-ink-3" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search trips, vehicles, drivers, employees, pages…"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
          />
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-3" />
          ) : null}
          <kbd className="numeric rounded-[4px] border border-line bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-3">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-3">
            No matches for “{query}”.
          </Command.Empty>

          {results.length ? (
            <Command.Group
              heading="Results"
              className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2"
            >
              {results.map((result) => {
                const Icon = KIND_ICON[result.kind];
                return (
                  <Command.Item
                    key={`${result.kind}-${result.id}`}
                    onSelect={() => run(result)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-2 text-[13px] text-ink-2 data-[selected=true]:bg-signal-wash data-[selected=true]:text-ink"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1 truncate">{result.label}</span>
                    <span className="truncate text-[11.5px] text-ink-3">{result.context}</span>
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-0 data-[selected=true]:opacity-60" />
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}
        </Command.List>

        <div className="flex items-center justify-between border-t border-line bg-surface-2 px-3.5 py-2">
          <p className="text-[11px] text-ink-3">
            <span className="numeric">↑↓</span> navigate ·{" "}
            <span className="numeric">↵</span> open
          </p>
          <p className="numeric text-[11px] text-ink-3">STAFFRIDE</p>
        </div>
      </Command>
    </div>
  );
}

/** The ⌘K trigger rendered in the top bar. */
export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-8 w-full max-w-[280px] items-center gap-2 rounded-full border border-line bg-surface-2 px-3",
        "text-[12.5px] text-ink-3 transition-colors duration-150 hover:border-line-strong hover:text-ink-2",
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate text-left">Search…</span>
      <kbd className="numeric rounded-[4px] border border-line bg-surface-1 px-1.5 py-px text-[10px]">
        ⌘K
      </kbd>
    </button>
  );
}
