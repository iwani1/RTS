/**
 * The contract every external provider client honours.
 *
 * The rest of the app never talks to a vendor directly. It calls a provider
 * function, gets a plain result back, and writes that result into the
 * delivery columns of the message row. A provider that is not configured
 * returns `ok: false` with an explanation — it never pretends to have sent
 * anything.
 */
export type ProviderResult = {
  /** True only when the vendor confirmed acceptance of the message. */
  ok: boolean;
  /** The vendor that handled the message, e.g. `hubtel` or `smtp`. */
  provider: string;
  /** The vendor's message id, when it gave one. */
  ref: string | null;
  /** Why it failed, in plain words an operator can act on. */
  error: string | null;
};

export function providerOk(
  provider: string,
  ref: string | null = null,
): ProviderResult {
  return { ok: true, provider, ref, error: null };
}

export function providerFail(
  provider: string,
  error: string,
  ref: string | null = null,
): ProviderResult {
  return { ok: false, provider, ref, error };
}
