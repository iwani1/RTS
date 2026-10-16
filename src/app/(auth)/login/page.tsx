import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Panel } from "@/components/ui";
import { Field } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser, homeFor } from "@/lib/auth";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const DEMO = [
  ["Super Administrator", "admin@staffridegh.com", "2FA 246810"],
  ["Operations Manager", "ops@staffridegh.com", ""],
  ["Dispatcher", "dispatch@staffridegh.com", ""],
  ["Fleet Manager", "fleet@staffridegh.com", ""],
  ["Finance Officer", "finance@staffridegh.com", ""],
  ["Corporate HR · Sikaman", "hr@sikamanfinancial.com", ""],
  ["Employee · Sikaman", "ama@sikamanfinancial.com", ""],
  ["Driver · Kwesi", "driver.kwesi@staffridegh.com", ""],
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const { oidcConfig } = await import("@/lib/sso");
  const ssoAvailable = Boolean(oidcConfig());
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role as Role));

  return (
    <div>
      <p className="eyebrow">Secure access</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
        Sign in
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        Use your work account. Privileged roles are protected by a second factor.
      </p>

      <AuthForm
        action="/api/auth/login"
        submitLabel="Sign in"
        error={error}
        notice={notice}
        className="mt-6"
      >
        <div className="flex flex-col gap-3">
          <Field
            label="Email address"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
          <Field
            label="Two-factor code"
            name="code"
            placeholder="000000"
            hint="Only required for accounts with two-factor authentication enabled."
          />
        </div>
      </AuthForm>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12.5px]">
        <Link
          href="/forgot-password"
          className="text-ink-2 transition-colors hover:text-ink"
        >
          Forgot password?
        </Link>
        <Link href="/otp" className="text-ink-2 transition-colors hover:text-ink">
          Sign in with a code
        </Link>
        <Link
          href="/register"
          className="text-ink-2 transition-colors hover:text-ink"
        >
          Create an account
        </Link>
      </div>

      {ssoAvailable ? (
        <div className="mt-5">
          <Link
            href="/api/auth/oidc"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-line-strong px-4 font-display text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Continue with single sign-on
          </Link>
        </div>
      ) : (
        <p className="mt-5 text-[11.5px] leading-relaxed text-ink-3">
          Single sign-on is available once an OpenID Connect provider is configured
          (<code className="numeric">OIDC_ISSUER</code>,{" "}
          <code className="numeric">OIDC_CLIENT_ID</code>,{" "}
          <code className="numeric">OIDC_CLIENT_SECRET</code>). Password and one-time
          code sign-in are active now.
        </p>
      )}

      <Panel
        className="mt-8"
        eyebrow="Demonstration data"
        title="Try a role"
        subtitle="Every account below uses the password Password123!"
      >
        <ul className="divide-y divide-line">
          {DEMO.map(([role, email, note]) => (
            <li
              key={email}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
            >
              <span className="text-[12.5px] text-ink">{role}</span>
              <span className="flex items-center gap-2">
                <code className="numeric rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                  {email}
                </code>
                {note ? (
                  <span className="numeric text-[11px] text-st-caution">{note}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <p className="text-[11.5px] text-ink-3">
          New to StaffRide?
        </p>
        <ButtonLink href="/register" variant="outline" size="sm">
          Request access
        </ButtonLink>
      </div>
    </div>
  );
}
