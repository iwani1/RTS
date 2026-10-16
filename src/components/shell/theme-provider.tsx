"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";

type ThemeContextValue = {
  theme: Theme;
  density: Density;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setDensity: (density: Density) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "tms-theme";
const DENSITY_KEY = "tms-density";

/**
 * Theme and density live in `localStorage`, which is an external store.
 *
 * `useSyncExternalStore` is the correct way to read it: the server snapshot is
 * a fixed value so the first paint hydrates cleanly, and the client snapshot
 * is the stored preference. It also removes the "set state inside an effect"
 * pattern, which caused a cascading render on every mount.
 */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  emit();
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getThemeSnapshot(): Theme {
  const stored = readStorage(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : systemTheme();
}

function getDensitySnapshot(): Density {
  const stored = readStorage(DENSITY_KEY);
  return stored === "compact" || stored === "comfortable" ? stored : "comfortable";
}

/** The value the server rendered with — dark, matching the inline head script. */
function getServerTheme(): Theme {
  return "dark";
}

function getServerDensity(): Density {
  return "comfortable";
}

/**
 * Dark mode ships day one. The initial class is applied by an inline script in
 * the document head, so there is never a white flash — this provider only
 * takes over once React has hydrated.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerTheme);
  const density = useSyncExternalStore(subscribe, getDensitySnapshot, getServerDensity);

  // Applying the resolved preference to the document is an external-system
  // update, which is exactly what an effect is for.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    writeStorage(THEME_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = getThemeSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    writeStorage(THEME_KEY, next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    document.documentElement.dataset.density = next;
    writeStorage(DENSITY_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ theme, density, setTheme, toggleTheme, setDensity }),
    [theme, density, setTheme, toggleTheme, setDensity],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
