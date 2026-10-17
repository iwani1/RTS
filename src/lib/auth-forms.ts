import { NextResponse } from "next/server";
import { internalPath, isCrossSiteRequest } from "@/lib/guards";

export { internalPath, isCrossSiteRequest };

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
  const url = new URL(internalPath(path), request.url);
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

/** The response for a refused cross-site request. */
export function crossSiteResponse(): NextResponse {
  return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
}
