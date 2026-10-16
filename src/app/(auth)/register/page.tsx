import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Field } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <p className="eyebrow">Employee self registration</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
        Create your account
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        If your work email is already registered by your HR team, the account is
        activated the moment you sign in.
      </p>

      <AuthForm
        action="/api/auth/register"
        submitLabel="Create account"
        error={error}
        className="mt-6"
      >
        <div className="flex flex-col gap-3">
          <Field label="Full name" name="fullName" required placeholder="Ama Serwaa" />
          <Field
            label="Work email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="ama@sikamanfinancial.com"
          />
          <Field
            label="Mobile number"
            name="phone"
            placeholder="+233 24 000 0000"
            hint="Used for trip reminders and boarding verification."
          />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            hint="Minimum 8 characters."
          />
        </div>
      </AuthForm>

      <p className="mt-5 text-[12.5px] text-ink-2">
        Already registered?{" "}
        <Link
          href="/login"
          className="text-ink transition-colors hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
