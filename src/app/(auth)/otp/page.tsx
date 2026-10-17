import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Field } from "@/components/ui/input";
import { Panel } from "@/components/ui";
import { Notice } from "@/components/ui/stat";

export const dynamic = "force-dynamic";

/**
 * Phone sign-in.
 *
 * A one-time code replaces the password. With no SMS provider configured the
 * code is shown on screen, labelled as a demonstration delivery — the app
 * does not claim to have sent a message it could not send.
 */
export default async function OtpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; code?: string; email?: string }>;
}) {
  const { error, notice, code, email } = await searchParams;

  return (
    <div>
      <p className="eyebrow">Passwordless sign-in</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
        Sign in with a code
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        We send a six-digit code to the phone number on your account. It lasts ten
        minutes and works once.
      </p>

      <AuthForm
        action="/api/auth/otp"
        submitLabel="Send me a code"
        error={error}
        notice={notice}
        className="mt-6"
      >
        <Field
          label="Work email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={email ?? ""}
          placeholder="you@company.com"
        />
      </AuthForm>

      {code ? (
        <AuthForm
          action="/api/auth/otp/verify"
          submitLabel="Verify and sign in"
          className="mt-6"
        >
          <Field
            label="Email address"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={email ?? ""}
          />
          <div className="mt-3">
            <Field
              label="Six-digit code"
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              hint="Demo delivery — enter the code shown above."
            />
          </div>
        </AuthForm>
      ) : null}

      {code ? (
        <Notice tone="caution" className="mt-5 text-[12px]">
          No outbound SMS provider is configured in this environment, so the code is
          displayed here instead of being sent to a handset.
        </Notice>
      ) : null}

      <div className="mt-5 flex items-center justify-between text-[12.5px]">
        <Link href="/login" className="text-ink transition-colors hover:underline">
          Sign in with a password
        </Link>
        <Link href="/register" className="text-ink-2 transition-colors hover:text-ink">
          Create an account
        </Link>
      </div>

      <Panel
        className="mt-8"
        eyebrow="Demonstration data"
        title="Try a role"
        subtitle="Request a code for any of these accounts; the code is shown on screen in this environment."
      >
        <ul className="divide-y divide-line">
          {[
            ["Super Administrator", "admin@richietransportgh.com"],
            ["Operations Manager", "ops@richietransportgh.com"],
            ["Dispatcher", "dispatch@richietransportgh.com"],
            ["Fleet Manager", "fleet@richietransportgh.com"],
            ["Finance Officer", "finance@richietransportgh.com"],
            ["Employee · Sikaman", "ama@sikamanfinancial.com"],
          ].map(([role, address]) => (
            <li
              key={address}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
            >
              <span className="text-[12.5px] text-ink">{role}</span>
              <code className="numeric rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                {address}
              </code>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
