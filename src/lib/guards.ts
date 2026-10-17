/**
 * The guards that keep a request inside this application.
 *
 * They are plain functions with no framework dependency on purpose: they
 * decide whether a redirect may happen and whether a form post came from the
 * origin the user is looking at, and they are pinned down by the test suite
 * in `tests/security.test.ts`.
 */

/**
 * Keep a redirect inside this application.
 *
 * The target often comes from a form field — `returnTo`, for example — so a
 * page on another site could otherwise ask the application to send the user
 * somewhere else after a sign-in or a save. Only a plain path inside this
 * origin is allowed; anything absolute, protocol-relative or disguised with a
 * backslash is refused.
 */
export function internalPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw.includes("\\")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  return raw;
}

/**
 * The host the request was addressed to.
 *
 * A reverse proxy rewrites the `Host` header, so the forwarded value wins
 * when it is present — that is the host the browser believes it is talking
 * to.
 */
function requestHost(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-host");
  const raw = forwarded?.split(",")[0]?.trim() || request.headers.get("host");
  if (!raw) return null;
  try {
    return new URL(`http://${raw}`).host.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Reject a cross-site form post.
 *
 * React server actions carry Next's own origin check, but a route handler
 * does not. The public auth screens post to route handlers so they work
 * without JavaScript, so they need the check of their own — otherwise a page
 * on another site can drive a sign-in, a sign-out or a password reset in
 * this origin.
 *
 * A browser always sends `Origin` on a form post, and `Referer` when the
 * origin is suppressed. A request that carries neither did not come from a
 * browser form, so it is refused rather than trusted.
 */
export function isCrossSiteRequest(request: Request): boolean {
  const host = requestHost(request);
  if (!host) return true;

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      return new URL(origin).host.toLowerCase() !== host;
    } catch {
      return true;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host.toLowerCase() !== host;
    } catch {
      return true;
    }
  }

  // Neither header: not a browser form post.
  return true;
}
