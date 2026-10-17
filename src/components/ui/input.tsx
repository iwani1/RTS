import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-[8px] border border-line-strong bg-surface-1 px-3 text-[13.5px] text-ink " +
  "placeholder:text-ink-3 transition-colors duration-150 " +
  "hover:border-ink-3 focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Input({
  className,
  ...props
}: ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-9", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "py-2 leading-relaxed", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        CONTROL,
        "h-9 cursor-pointer appearance-none bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a9199' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  className,
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-surface-1",
        "checked:border-signal checked:bg-signal",
        "checked:bg-[length:11px] checked:bg-center checked:bg-no-repeat",
        "focus:outline-none focus:ring-2 focus:ring-signal/25",
        "disabled:opacity-50",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230b0c0e' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  );
}

/**
 * A labelled form control.
 *
 * Two modes, one component:
 *  - wrapper  → pass `children` (the control you built)
 *  - built-in → pass `name` (+ type/options/…) and the control is rendered for you
 *
 * The label is always rendered, even when visually hidden by the caller, so
 * every input has an accessible name.
 */
type FieldProps = {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children?: ReactNode;
  htmlFor?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string | number | null;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  autoComplete?: string;
  /** Numeric keypad hint on mobile, e.g. for a one-time code. */
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url" | "search";
  min?: string | number;
  max?: string | number;
  step?: string | number;
  /** A field that is shown for information but cannot be edited. */
  disabled?: boolean;
};

export function Field({
  label,
  hint,
  error,
  disabled,
  required,
  className,
  children,
  htmlFor,
  name,
  type = "text",
  placeholder,
  defaultValue,
  options,
  rows,
  autoComplete,
  inputMode,
  min,
  max,
  step,
}: FieldProps) {
  const controlId = htmlFor ?? name;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={controlId}
        className="flex items-center gap-1 font-display text-[12.5px] font-medium text-ink-2"
      >
        {label}
        {required ? <span className="text-signal">*</span> : null}
      </label>

      {children ??
        (options ? (
          <Select id={controlId} name={name} defaultValue={defaultValue ?? undefined}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : type === "textarea" ? (
          <Textarea
            id={controlId}
            name={name}
            rows={rows ?? 3}
            placeholder={placeholder}
            defaultValue={defaultValue ?? undefined}
          />
        ) : (
          <Input
            id={controlId}
            name={name}
            type={type}
            placeholder={placeholder}
            defaultValue={defaultValue ?? undefined}
            autoComplete={autoComplete}
            inputMode={inputMode}
            min={min}
            max={max}
            step={step}
            required={required}
            disabled={disabled}
          />
        ))}

      {error ? (
        <p className="text-[12px] text-st-critical">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** Read-only key/value pair. */
export function DefinitionList({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-[12.5px] text-ink-3">{item.label}</dt>
          <dd className="text-right text-[13px] font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
