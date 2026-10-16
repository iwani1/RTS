"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  LogOut,
  Moon,
  Rows3,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/button";
import { useTheme } from "./theme-provider";
import { CommandPalette, SearchTrigger } from "./command-palette";

export type TickerEvent = {
  at: string;
  text: string;
  tone?: "live" | "ok" | "caution" | "critical" | "idle";
};

/**
 * The top bar. Breadcrumb, search, the live ticker, and the account cluster.
 * The ticker is the product's pulse — it is present on every operations screen.
 */
export function TopBar({
  breadcrumb,
  events,
  userName,
  roleLabel,
  unread,
  signOutAction,
}: {
  breadcrumb: Array<{ label: string; href?: string }>;
  events: TickerEvent[];
  userName: string;
  roleLabel: string;
  unread: number;
  signOutAction: string;
}) {
  const { theme, toggleTheme, density, setDensity } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (events.length < 2) return;
    const timer = setInterval(() => setTick((t) => (t + 1) % events.length), 4200);
    return () => clearInterval(timer);
  }, [events.length]);

  const current = events.length ? events[tick % events.length] : null;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface-1/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 md:flex">
            {breadcrumb.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 ? (
                  <span aria-hidden className="text-ink-3">
                    /
                  </span>
                ) : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="truncate font-display text-[12.5px] text-ink-3 transition-colors hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate font-display text-[12.5px] font-medium text-ink">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>

          {/* The live ticker — the operational pulse. */}
          {current ? (
            <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
              <span className="h-3.5 w-px bg-line" />
              <span className="numeric shrink-0 text-[11.5px] text-ink-3">{current.at}</span>
              <span
                className={cn(
                  "truncate text-[12px]",
                  current.tone === "critical" && "text-st-critical",
                  current.tone === "caution" && "text-st-caution",
                  current.tone === "ok" && "text-ink-2",
                  (!current.tone || current.tone === "live" || current.tone === "idle") &&
                    "text-ink-2",
                )}
              >
                {current.text}
              </span>
            </div>
          ) : (
            <div className="hidden flex-1 lg:block" />
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <div className="hidden w-[220px] xl:block">
              <SearchTrigger onClick={() => setPaletteOpen(true)} />
            </div>
            <IconButton
              label="Search (⌘K)"
              onClick={() => setPaletteOpen(true)}
              className="xl:hidden"
            >
              <SearchGlyph />
            </IconButton>

            {/* Density */}
            <IconButton
              label={density === "compact" ? "Comfortable density" : "Compact density"}
              onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
            >
              <Rows3 className="h-4 w-4" />
            </IconButton>

            {/* Theme */}
            <IconButton
              label={theme === "dark" ? "Switch to light" : "Switch to dark"}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconButton>

            {/* Notifications */}
            <Link
              href="/settings"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <Bell className="h-4 w-4" />
              {unread ? (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-signal" />
              ) : null}
            </Link>

            {/* Account */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex h-9 items-center gap-2 rounded-full pl-1 pr-2 transition-colors hover:bg-surface-2"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal-wash font-display text-[11px] font-semibold text-signal-text">
                  {initials(userName)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[120px] truncate font-display text-[12.5px] font-medium text-ink">
                    {userName}
                  </span>
                  <span className="block text-[10.5px] text-ink-3">{roleLabel}</span>
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-ink-3 sm:block" />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  className="surface absolute right-0 top-11 w-56 overflow-hidden rounded-[8px] p-1"
                >
                  <div className="px-2.5 py-2">
                    <p className="truncate font-display text-[12.5px] font-medium text-ink">
                      {userName}
                    </p>
                    <p className="truncate text-[11px] text-ink-3">{roleLabel}</p>
                  </div>
                  <div className="my-1 h-px bg-line" />
                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    Profile & settings
                  </Link>
                  <Link
                    href="/docs"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    Documentation
                  </Link>
                  <div className="my-1 h-px bg-line" />
                  <form action={signOutAction} method="post">
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[12.5px] text-st-critical transition-colors hover:bg-st-critical-wash"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
