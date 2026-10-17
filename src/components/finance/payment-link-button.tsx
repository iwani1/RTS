"use client";

import { useActionState, useState } from "react";
import { Copy, Loader2, Link2 } from "lucide-react";
import { requestPaymentLinkAction } from "@/app/actions/finance";
import { cn } from "@/lib/utils";

/**
 * Ask the payment provider for a link and show it.
 *
 * The button states plainly which mode it is in: with a provider configured
 * it produces a real link, and without one it says that the invoice has to
 * be settled by transfer.
 */
export function PaymentLinkButton({
  invoiceId,
  invoiceNo,
  outstanding,
}: {
  invoiceId: number;
  invoiceNo: string;
  outstanding: number;
}) {
  const [state, formAction, pending] = useActionState(requestPaymentLinkAction, null);
  const [copied, setCopied] = useState(false);
  const url = state?.data?.url;

  if (state?.ok && url) {
    return (
      <div className="flex items-center justify-end gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-display text-[12px] font-medium text-signal underline-offset-4 hover:underline"
        >
          Open payment page
        </a>
        <button
          type="button"
          title="Copy the link"
          aria-label="Copy the payment link"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-[4px] border border-line p-1 text-ink-3 transition-colors hover:text-ink"
        >
          <Copy className="h-3 w-3" />
        </button>
        <span className="numeric text-[10.5px] text-ink-3">
          {copied ? "Copied" : state.data?.reference}
        </span>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center justify-end gap-2">
      <input type="hidden" name="invoiceId" value={String(invoiceId)} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong px-3",
          "font-display text-[12px] font-medium text-ink transition-colors hover:bg-surface-2",
          "disabled:pointer-events-none disabled:opacity-45",
        )}
        title={`Request a payment link for ${invoiceNo}`}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Link2 className="h-3 w-3" />
        )}
        Payment link
      </button>
      {state?.message && !state.ok ? (
        <span className="max-w-[220px] text-[11px] text-st-critical">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
