"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { StatusChip } from "@/components/ui/badge";
import { isDatabaseContention } from "@/lib/db-errors";

/**
 * The root error boundary.
 *
 * A failed request should never be a blank page. The most common failure on
 * a workstation is the local database being held by a second process, so that
 * case gets a named cause and the exact command that fixes it. Everything
 * else gets the reference that CI prints, so a failure can be reported.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error?.message ?? "Unknown error";
  const contention = isDatabaseContention(error);

  useEffect(() => {
    // The same line the server writes, so a report carries the reference.
    console.error("[staffride] unhandled render error:", message);
  }, [message]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-abyss px-6 py-16">
      <div className="w-full max-w-lg rounded-[8px] border border-line bg-surface-1 p-7">
        <div className="flex items-center gap-2.5">
          <StatusChip tone="critical" label="Critical" />
          <p className="eyebrow">Request failed</p>
        </div>

        <h1 className="mt-4 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
          {contention
            ? "The local database is held by another process"
            : "Something went wrong on this screen"}
        </h1>

        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
          {contention
            ? "PGlite is single-process, so only one server may open the data directory at a time. Stop the other server, or give this one its own directory, and the app will recover on its own."
            : "The request was recorded with a reference. The details below are what the server logged."}
        </p>

        {contention ? (
          <pre className="mt-4 overflow-x-auto rounded-[8px] border border-line bg-surface-2 p-3.5 font-mono text-[12px] leading-relaxed text-ink-2">
            <code>PGLITE_DATA_DIR=.data/pgdata-dev npm run dev</code>
          </pre>
        ) : null}

        <details className="mt-4 rounded-[8px] border border-line bg-surface-2">
          <summary className="cursor-pointer px-3.5 py-2.5 text-[12.5px] font-medium text-ink-2">
            Technical detail
          </summary>
          <div className="border-t border-line px-3.5 py-3">
            <p className="break-words font-mono text-[11.5px] leading-relaxed text-ink-3">
              {message}
            </p>
            {error?.digest ? (
              <p className="mt-2 font-mono text-[11.5px] text-ink-3">
                Reference {error.digest}
              </p>
            ) : null}
          </div>
        </details>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Button variant="signal" onClick={reset}>
            Try again
          </Button>
          <ButtonLink variant="outline" href="/dashboard">
            Back to the dashboard
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
