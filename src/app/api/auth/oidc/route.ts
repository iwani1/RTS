import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizationUrl, createPkce, oidcConfig } from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * Start an OpenID Connect sign-in.
 *
 * The PKCE verifier and the state are held in short-lived, http-only cookies
 * so the callback can verify them. When no provider is configured the route
 * answers 503 with a clear reason rather than redirecting into a broken flow.
 */
export async function GET(request: Request) {
  // No origin check here. This is a top-level redirect, and a browser sends
  // no `Origin` on a navigation GET — requiring one would break every
  // sign-in. The defence is the `state` value and the PKCE verifier, both
  // held in http-only cookies and both checked on the callback.
  const config = oidcConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "Single sign-on is not configured.",
        detail:
          "Set OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET to enable it.",
      },
      { status: 503 },
    );
  }

  const { verifier, challenge } = createPkce();
  const state = randomBytes(16).toString("base64url");
  const url = authorizationUrl(config, challenge, state);

  const response = NextResponse.redirect(url, 307);
  const secure = new URL(request.url).protocol === "https:";
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/api/auth/oidc",
    maxAge: 600,
  };
  response.cookies.set("oidc_state", state, options);
  response.cookies.set("oidc_verifier", verifier, options);
  return response;
}
