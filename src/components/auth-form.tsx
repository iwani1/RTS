import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A plain HTML form for the public auth screens.
 *
 * It posts to a route handler rather than a server action so that signing in
 * works with JavaScript disabled. No client boundary, no script dependency:
 * the browser performs a normal navigation and the server redirects back with
 * a message.
 */
export function AuthForm({
  action,
  submitLabel,
  children,
  error,
  notice,
  className,
}: {
  action: string;
  submitLabel: string;
  children: ReactNode;
  error?: string;
  notice?: string;
  className?: string;
}) {
  return (
    <form action={action} method="post" className={className}>
      {children}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[8px] border border-st-critical/30 bg-st-critical/10 px-3 py-2 text-[12.5px] leading-relaxed text-st-critical"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="mt-3 rounded-[8px] border border-st-ok/30 bg-st-ok/10 px-3 py-2 text-[12.5px] leading-relaxed text-st-ok"
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="signal">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
