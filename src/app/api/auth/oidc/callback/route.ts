import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, homeFor } from "@/lib/auth";
import type { Role } from "@/lib/rbac";
import { exchangeCode, oidcConfig } from "@/lib/sso";
import { log } from "@/lib/observability";

export const dynamic = "force-dynamic";

/** Complete an OpenID Connect sign-in. */
export async function GET(request: Request) {
  // No origin check here. This is a top-level redirect, and a browser sends
  // no `Origin` on a navigation GET — requiring one would break every
  // sign-in. The defence is the `state` value and the PKCE verifier, both
  // held in http-only cookies and both checked on the callback.
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const expectedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("oidc_state="))
    ?.split("=")[1];
  const verifier = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("oidc_verifier="))
    ?.split("=")[1];

  const fail = (message: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, request.url),
      303,
    );

  if (error) return fail("The identity provider cancelled the sign-in.");
  if (!code) return fail("The identity provider did not return a code.");
  if (!expectedState || state !== expectedState) {
    return fail("The sign-in request could not be verified. Please try again.");
  }

  const config = oidcConfig();
  if (!config) return fail("Single sign-on is not configured.");

  let profile: { subject: string; email: string; name: string };
  try {
    profile = await exchangeCode(config, code, verifier ?? "");
  } catch (caught) {
    log("error", "oidc.callback_failed", { message: (caught as Error).message });
    return fail("The identity provider could not be reached.");
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, profile.email))
    .limit(1);

  let user = existing;
  if (!user) {
    // A first-time single sign-on creates a pending account, so a new person
    // cannot simply appear with operational rights.
    const [created] = await db
      .insert(users)
      .values({
        email: profile.email,
        fullName: profile.name,
        // A random, unusable password: this account signs in through the
        // identity provider only.
        passwordHash: `sso:${Math.random().toString(36).slice(2)}`,
        role: "driver",
        status: "pending",
        ssoProvider: new URL(config.issuer).host,
        ssoSubject: profile.subject,
      })
      .returning();
    user = created;
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          "Your account was created and is waiting for administrator approval.",
        )}`,
        request.url,
      ),
      303,
    );
  }

  if (user.status !== "active") {
    return fail(`Your account is ${user.status}. Contact your administrator.`);
  }

  await db
    .update(users)
    .set({ ssoProvider: new URL(config.issuer).host, ssoSubject: profile.subject })
    .where(eq(users.id, user.id));

  await createSession(user.id);
  return NextResponse.redirect(
    new URL(homeFor(user.role as Role), request.url),
    303,
  );
}
