"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronsLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavEntry } from "./nav-config";
import { ICONS } from "./icons";
import { IconButton } from "@/components/ui/button";


/* ------------------------------------------------------- rail persistence */

const RAIL_KEY = "tms-rail";
const railListeners = new Set<() => void>();

function emitRailChange() {
  for (const listener of railListeners) listener();
}

function subscribeRail(listener: () => void) {
  railListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    railListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getRailSnapshot(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function getServerRailSnapshot(): boolean {
  return false;
}

export type ShellNavItem = NavEntry & { badge?: number };

export type ShellNavGroup = { id: string; label: string; items: ShellNavItem[] };

/**
 * The rail. Grouped, collapsible, and driven by the RBAC matrix — but
 * presented as five operational groups rather than a flat permission list.
 */
export function Sidebar({
  groups,
  standalone,
  brand,
  roleLabel,
  userName,
}: {
  groups: ShellNavGroup[];
  standalone: ShellNavItem[];
  brand: string;
  roleLabel: string;
  userName: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // The rail width is persisted in `localStorage`, an external store, so it is
  // read with `useSyncExternalStore` rather than a mount effect. The server
  // snapshot is the expanded rail, which matches the markup the server emits.
  const collapsed = useSyncExternalStore(subscribeRail, getRailSnapshot, getServerRailSnapshot);

  useEffect(() => {
    document.documentElement.dataset.rail = collapsed ? "collapsed" : "expanded";
  }, [collapsed]);

  const toggleCollapsed = () => {
    const next = !getRailSnapshot();
    try {
      localStorage.setItem(RAIL_KEY, next ? "collapsed" : "expanded");
    } catch {
      /* storage unavailable */
    }
    emitRailChange();
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  return (
    <>
      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        aria-label="Toggle navigation"
        className="fixed bottom-5 left-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-signal text-signal-ink lg:hidden"
      >
        <PanelLeftOpen className="h-5 w-5" />
      </button>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface-2 transition-[width,transform] duration-200 ease-[var(--ease-instrument)]",
          "lg:translate-x-0",
          collapsed ? "lg:w-[64px]" : "lg:w-[244px]",
          "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-3",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <BrandMark />
          <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <p className="truncate font-display text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
              {brand}
            </p>
            <p className="truncate text-[11px] text-ink-3">{roleLabel}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {groups.map((group) => (
            <div key={group.id} className="mb-4 last:mb-0">
              <p
                className={cn(
                  "eyebrow mb-1.5 px-2.5",
                  collapsed && "lg:text-center lg:text-[0px]",
                )}
              >
                {group.label}
              </p>
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = ICONS[item.icon];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-[8px] py-[7px] pl-2.5 pr-2",
                          "font-display text-[13px] transition-colors duration-150",
                          collapsed && "lg:justify-center lg:px-0",
                          active
                            ? "bg-signal-wash font-semibold text-signal-text"
                            : "text-ink-2 hover:bg-surface-3 hover:text-ink",
                        )}
                      >
                        {active ? (
                          <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-signal" />
                        ) : null}
                        <Icon
                          className={cn(
                            "h-[17px] w-[17px] shrink-0",
                            active ? "text-signal" : "text-ink-3",
                          )}
                        />
                        <span className={cn("truncate", collapsed && "lg:hidden")}>
                          {item.label}
                        </span>
                        {item.badge ? (
                          <span
                            className={cn(
                              "numeric ml-auto rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] font-medium text-ink-2 ring-1 ring-inset ring-line",
                              collapsed && "lg:hidden",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {standalone.length ? (
            <div className="mt-4 border-t border-line pt-3">
              <p
                className={cn(
                  "eyebrow mb-1.5 px-2.5",
                  collapsed && "lg:text-center lg:text-[0px]",
                )}
              >
                Workspace
              </p>
              <ul className="space-y-px">
                {standalone.map((item) => {
                  const active = isActive(item.href);
                  const Icon = ICONS[item.icon];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[8px] py-[7px] pl-2.5 pr-2",
                          "font-display text-[13px] transition-colors duration-150",
                          collapsed && "lg:justify-center lg:px-0",
                          active
                            ? "bg-signal-wash font-semibold text-signal-text"
                            : "text-ink-2 hover:bg-surface-3 hover:text-ink",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[17px] w-[17px] shrink-0",
                            active ? "text-signal" : "text-ink-3",
                          )}
                        />
                        <span className={cn("truncate", collapsed && "lg:hidden")}>
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </nav>

        {/* Collapse control */}
        <div
          className={cn(
            "flex h-11 shrink-0 items-center border-t border-line px-3",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <IconButton
            label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={toggleCollapsed}
            className="hidden lg:inline-flex"
          >
            {collapsed ? (
              <ChevronsLeft className="h-4 w-4 rotate-180" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </IconButton>
          <p className={cn("truncate text-[11.5px] text-ink-3", collapsed && "lg:hidden")}>
            {userName}
          </p>
        </div>
      </aside>
    </>
  );
}

/**
 * The mark: a shuttle nose broken by a route polyline that overshoots into a
 * node. Not the letters "SR" in a rounded square.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-signal",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
        <path
          d="M4 17.5h2.2M17.8 17.5H20"
          stroke="#0B0C0E"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M4 17.5V10.8c0-.6.3-1.2.8-1.5l1.9-1.2A3 3 0 0 1 8.6 7.5h6.8c.6 0 1.2.2 1.7.6l1.6 1.2c.4.3.6.8.6 1.3v6.9"
          stroke="#0B0C0E"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="7.6" cy="12.2" r="1.15" fill="#0B0C0E" />
        <circle cx="16.4" cy="12.2" r="1.15" fill="#0B0C0E" />
        <path
          d="M4 6.2c3.2 0 4.6 1.6 7.4 1.6 2.6 0 3.8-1.2 6.4-1.2"
          stroke="#0B0C0E"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="18.2" cy="6.6" r="1.6" fill="#0B0C0E" />
      </svg>
    </span>
  );
}
