import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Field } from "@/components/ui/input";
import { Notice } from "@/components/ui/stat";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  return (
    <div>
      <p className="eyebrow">Account recovery</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
        Recover access
      </h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        We generate a single-use reset link that expires in one hour.
      </p>

      <AuthForm
        action="/api/auth/forgot-password"
        submitLabel="Generate reset link"
        error={error}
        notice={notice}
        className="mt-6"
      >
        <Field
          label="Account email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </AuthForm>

      <Notice tone="caution" className="mt-5 text-[12px]">
        No outbound email provider is configured in this environment, so the reset
        link is displayed on screen instead of being emailed.
      </Notice>

      <p className="mt-5 text-[12.5px] text-ink-2">
        <Link href="/login" className="text-ink transition-colors hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
