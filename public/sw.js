/* eslint-disable no-restricted-globals */
/**
 * StaffRide service worker.
 *
 * Scope is deliberately narrow. The app is multi-tenant and every portal
 * screen is authenticated, so this worker never caches an HTML response or an
 * API payload — doing so would leak one user's operational data to the next
 * person who signs in on the same device.
 *
 * What it does cache:
 *   • the build's static assets (immutable, safe to cache forever)
 *   • the offline shell, so the driver app can explain that it is offline
 *     instead of showing a browser error
 */

const VERSION = "staffride-v1";
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;

const SHELL_URLS = ["/offline"];

/** Static build output and icons. */
const STATIC_PATTERN = /\/_next\/static\/|^\/icons\/|\.(?:css|js|woff2?|png|svg|ico|webp)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept or cache authenticated data.
  if (
    url.pathname.startsWith("/api/") ||
    request.headers.get("accept")?.includes("application/json")
  ) {
    return;
  }

  // Immutable build output: cache first, it can never go stale.
  if (STATIC_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network first, offline shell as the fallback. The response is
  // never stored, so a signed-in page is never replayed from the cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match("/offline")
          .then((hit) => hit ?? Response.error()),
      ),
    );
  }
});
