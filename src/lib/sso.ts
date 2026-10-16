/**
 * OpenID Connect single sign-on.
 *
 * A standard authorization-code flow against any configured provider. The
 * provider is described entirely by environment variables, so swapping
 * Keycloak, Auth0, Entra ID or Google Workspace is a configuration change.
 *
 * When no provider is configured the feature reports that plainly. The login
 * screen labels it as unavailable rather than showing a button that cannot
 * work.
 */
import { createHash, randomBytes } from "node:crypto";
import { log } from "@/lib/observability";

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** The redirect URI registered with the provider. */
  redirectUri: string;
  scopes: string[];
};

export function oidcConfig(): OidcConfig | null {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;
  return {
    issuer: issuer.replace(/\/$/, ""),
    clientId,
    clientSecret,
    redirectUri:
      process.env.OIDC_REDIRECT_URI ??
      `${process.env.APP_URL ?? "http://localhost:3000"}/api/auth/oidc/callback`,
    scopes: (process.env.OIDC_SCOPES ?? "openid email profile").split(" ").filter(Boolean),
  };
}

/** The PKCE verifier and challenge for one sign-in attempt. */
export function createPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Where the browser is sent to authenticate. */
export function authorizationUrl(
  config: OidcConfig,
  challenge: string,
  state: string,
): string {
  const url = new URL(`${config.issuer}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Exchange an authorization code for an id token and the user profile. */
export async function exchangeCode(
  config: OidcConfig,
  code: string,
  verifier: string,
): Promise<{ subject: string; email: string; name: string }> {
  const response = await fetch(`${config.issuer}/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(
        `${config.clientId}:${config.clientSecret}`,
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    log("error", "oidc.token_exchange_failed", { status: response.status, body: body.slice(0, 200) });
    throw new Error("The identity provider rejected the sign-in request.");
  }

  const tokens = (await response.json()) as {
    id_token?: string;
    access_token?: string;
  };

  // The userinfo endpoint is the simplest way to read the profile, and every
  // provider implements it.
  const userinfo = await fetch(`${config.issuer}/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token ?? ""}` },
  });
  if (!userinfo.ok) {
    throw new Error("The identity provider did not return a profile.");
  }
  const profile = (await userinfo.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    preferred_username?: string;
  };

  const email = (profile.email ?? profile.preferred_username ?? "").toLowerCase();
  if (!email) {
    throw new Error("The identity provider did not return an email address.");
  }

  return {
    subject: profile.sub ?? email,
    email,
    name: profile.name ?? email,
  };
}
