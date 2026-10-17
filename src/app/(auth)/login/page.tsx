import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { DemoAccounts } from "@/components/demo-accounts";
import { Panel } from "@/components/ui";
import { Field } from "@/components/ui/input";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser, homeFor } from "@/lib/auth";
import { DEMO_PASSWORD } from "@/lib/seed";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const DEMO = [
  { role: "Super Administrator", email: "admin@richietransportgh.com", code: "246810" },
  { role: "Operations Manager", email: "ops@richietransportgh.com" },
  { role: "Dispatcher", email: "dispatch@richietransportgh.com" },
  { role: "Fleet Manager", email: "fleet@richietransportgh.com" },
  { role: "Finance Officer", email: "finance@richietransportgh.com" },
  { role: "Driver · Abena", email: "driver.abena@richietransportgh.com" },
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
        <DemoAccounts accounts={DEMO} password={DEMO_PASSWORD} />
      </Panel>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <p className="text-[11.5px] text-ink-3">
          New to Richie Transport Services?
        </p>
        <ButtonLink href="/register" variant="outline" size="sm">
          Request access
        </ButtonLink>
      </div>
    </div>
  );
}
