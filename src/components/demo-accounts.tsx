"use client";

import { useState } from "react";

export type DemoAccount = {
  role: string;
  email: string;
  /** Second factor, when the account has one. */
  code?: string;
};

/**
 * The demonstration accounts, with a button that fills the sign-in form.
 *
 * The form itself stays a plain HTML form that posts to a route handler, so
 * signing in still works with JavaScript disabled. This only removes the
 * chance of mistyping a long address — pick a role, press the button, press
 * "Sign in".
 */
export function DemoAccounts({
  accounts,
  password,
}: {
  accounts: DemoAccount[];
  password: string;
}) {
  const [chosen, setChosen] = useState<string | null>(null);

  function fill(account: DemoAccount) {
    const set = (id: string, value: string) => {
      const field = document.getElementById(id) as HTMLInputElement | null;
      if (!field) return;
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("email", account.email);
    set("password", password);
    set("code", account.code ?? "");
    setChosen(account.email);
    document.getElementById("password")?.focus();
  }

  return (
    <ul className="divide-y divide-line">
      {accounts.map((account) => (
        <li
          key={account.email}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
        >
          <span className="text-[12.5px] text-ink">{account.role}</span>
          <span className="flex items-center gap-2">
            <code className="numeric rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
              {account.email}
            </code>
            {account.code ? (
              <span className="numeric text-[11px] text-st-caution">
                2FA {account.code}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => fill(account)}
              className="rounded-full border border-line-strong px-2.5 py-0.5 text-[11.5px] text-ink-2 transition-colors duration-150 hover:border-signal hover:text-ink"
            >
              {chosen === account.email ? "Filled" : "Use"}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
