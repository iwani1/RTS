"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionState = {
  ok?: boolean;
  message?: string;
  data?: Record<string, string>;
} | null;

export type ServerAction = (
  state: ActionState,
  formData: FormData,
) => Promise<ActionState>;

type Variant = "primary" | "secondary" | "danger" | "ghost";

const SUBMIT_VARIANT: Record<Variant, string> = {
  primary:
    "bg-signal text-signal-ink font-semibold hover:bg-signal-press active:bg-signal-press",
  secondary:
    "border border-line-strong bg-surface-1 text-ink hover:bg-surface-2 active:bg-surface-3",
  danger:
    "border border-st-critical/35 bg-st-critical/12 text-st-critical hover:bg-st-critical/20",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
};

function SubmitButton({
  label,
  variant = "primary",
  confirm,
  size = "md",
}: {
  label: string;
  variant?: Variant;
  confirm?: string;
  size?: "sm" | "md";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-display font-medium",
        "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-instrument)]",
        "disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-7 px-3 text-[12px]" : "h-9 px-4 text-[13px]",
        SUBMIT_VARIANT[variant],
      )}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Working
        </>
      ) : (
        label
      )}
    </button>
  );
}

/**
 * Wraps a server action with progressive feedback so every mutating control in
 * the product has a real, implemented outcome (no dead buttons).
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = "primary",
  className,
  confirm,
  footer,
  resetOnSuccess,
}: {
  action: ServerAction;
  children?: ReactNode;
  submitLabel: string;
  submitVariant?: Variant;
  className?: string;
  confirm?: string;
  footer?: ReactNode;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      key={
        resetOnSuccess && state?.ok
          ? String(state.ok) + String(state.message)
          : undefined
      }
    >
      {children}
      {state?.message ? (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-[8px] border px-3 py-2 text-[12.5px]",
            state.ok
              ? "border-st-ok/30 bg-st-ok/10 text-st-ok"
              : "border-st-critical/30 bg-st-critical/10 text-st-critical",
          )}
        >
          {state.message}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <SubmitButton label={submitLabel} variant={submitVariant} confirm={confirm} />
        {footer}
      </div>
    </form>
  );
}

/** A single-action form that lives inside a table row or a card header. */
export function InlineActionForm({
  action,
  hiddenFields,
  submitLabel,
  variant = "secondary",
  confirm,
}: {
  action: ServerAction;
  hiddenFields: Record<string, string | number>;
  submitLabel: string;
  variant?: Variant;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <SubmitButton label={submitLabel} variant={variant} confirm={confirm} size="sm" />
      {state?.message ? (
        <span
          className={cn(
            "text-[11.5px]",
            state.ok ? "text-st-ok" : "text-st-critical",
          )}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
