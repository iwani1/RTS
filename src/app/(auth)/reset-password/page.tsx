import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Field } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; notice?: string }>;
}) {
  const { token, error, notice } = await searchParams;
  return (
    <div>
      <p className="eyebrow">Account recovery</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
        Set a new password
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        Paste the reset token and choose a new password. The token is single use.
      </p>

      <AuthForm
        action="/api/auth/reset-password"
        submitLabel="Update password"
        error={error}
        notice={notice}
        className="mt-6"
      >
        <div className="flex flex-col gap-3">
          <Field
            label="Reset token"
            name="token"
            required
            defaultValue={token ?? ""}
            placeholder="Paste the token from the reset link"
          />
          <Field
            label="New password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            hint="Minimum 8 characters."
          />
        </div>
      </AuthForm>

      <p className="mt-5 text-[12.5px] text-ink-2">
        <Link href="/login" className="text-ink transition-colors hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
