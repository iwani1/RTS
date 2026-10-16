import { NextResponse } from "next/server";

/**
 * Native (no-JavaScript) form handling for the public auth screens.
 *
 * Next 16 renders `useActionState` forms with `encType="multipart/form-data"`,
 * but the framework's no-JS server-action path only accepts
 * `application/x-www-form-urlencoded` (vercel/next.js#95447). A browser with
 * JavaScript disabled therefore cannot submit those forms.
 *
 * The four public auth screens post to a route handler instead, so signing in
 * and out never depends on a script bundle loading. The handlers call the very
 * same server actions, so there is one implementation of the business rules.
 */

/** Redirect back to an auth screen with a message the user can read. */
export function authRedirect(
  request: Request,
  path: string,
  key: "error" | "notice",
  message: string,
  extra: Record<string, string> = {},
): NextResponse {
  const url = new URL(path, request.url);
  url.searchParams.set(key, message);
  for (const [name, value] of Object.entries(extra)) {
    url.searchParams.set(name, value);
  }
  // 303 so the browser follows with a GET and never re-posts the credentials.
  return NextResponse.redirect(url, 303);
}

/** Read a submitted form, tolerating a malformed body. */
export async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
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

/** The response for a refused cross-site request. */
export function crossSiteResponse(): NextResponse {
  return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
}
