"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes the driver app
 * installable and usable with a flaky connection.
 *
 * It only runs in production builds — a worker active in development would
 * serve stale HTML and hide the changes being made.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.error("[pwa] service worker registration failed:", error);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
