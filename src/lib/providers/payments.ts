/**
 * Card and mobile-money payments.
 *
 * Paystack is the provider the company would use: it settles in Ghanaian
 * cedis, takes mobile money as well as cards, and tells the server exactly
 * what happened through a signed webhook. Flutterwave is supported as an
 * alternative with the same shape.
 *
 * Two calls matter: one that starts a payment and hands back a link the
 * client can use, and one that asks the provider whether a reference was
 * really paid. Nothing in the system believes a payment succeeded until the
 * provider says so.
 */
import { providerFail, providerOk, type ProviderResult } from "./types";

/** The provider base addresses. Read at call time so a test can point them elsewhere. */
function paystackBase(): string {
  return (process.env.PAYSTACK_API_BASE ?? "https://api.paystack.co").replace(/\/$/, "");
}
function flutterwaveBase(): string {
  return (process.env.FLUTTERWAVE_API_BASE ?? "https://api.flutterwave.com/v3").replace(/\/$/, "");
}

export type PaymentProviderName = "paystack" | "flutterwave" | null;

export function paymentsConfig(): {
  provider: PaymentProviderName;
  secretKey: string | null;
  publicKey: string | null;
} {
  if (process.env.PAYSTACK_SECRET_KEY) {
    return {
      provider: "paystack",
      secretKey: process.env.PAYSTACK_SECRET_KEY,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null,
    };
  }
  if (process.env.FLUTTERWAVE_SECRET_KEY) {
    return {
      provider: "flutterwave",
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY ?? null,
    };
  }
  return { provider: null, secretKey: null, publicKey: null };
}

export type PaymentRequest = {
  /** The amount in the currency's major unit, e.g. "1250.00". */
  amount: string;
  currency: string;
  email: string;
  /** A unique reference the app keeps, e.g. `INV-2026-0042`. */
  reference: string;
  description: string;
  /** Where the payer returns after paying. */
  callbackUrl: string;
  metadata?: Record<string, string | number>;
};

export type PaymentInitialisation = ProviderResult & {
  authorizationUrl: string | null;
  reference: string | null;
};

/** Convert major units into the smallest unit the provider expects. */
export function toMinorUnits(amount: string): number {
  const value = Number(String(amount).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Convert the smallest unit back into major units. */
export function fromMinorUnits(amount: number): string {
  return (amount / 100).toFixed(2);
}

/**
 * Start a payment and return the link the payer uses.
 *
 * The amount is checked before the request leaves: a payment for nothing, or
 * a negative one, is refused rather than sent to the provider.
 */
export async function initialisePayment(
  request: PaymentRequest,
): Promise<PaymentInitialisation> {
  const config = paymentsConfig();
  if (!config.provider || !config.secretKey) {
    return {
      ...providerFail(
        "none",
        "No payment provider is configured. Set PAYSTACK_SECRET_KEY to collect money online.",
      ),
      authorizationUrl: null,
      reference: null,
    };
  }

  const amount = Number(String(request.amount).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ...providerFail("none", "The amount to be paid must be greater than zero."),
      authorizationUrl: null,
      reference: null,
    };
  }
  if (!request.email.includes("@")) {
    return {
      ...providerFail("none", "The payer needs a valid email address."),
      authorizationUrl: null,
      reference: null,
    };
  }

  if (config.provider === "paystack") {
    return initialisePaystack(config.secretKey, request, amount);
  }
  return initialiseFlutterwave(config.secretKey, config.publicKey, request, amount);
}

async function initialisePaystack(
  secretKey: string,
  request: PaymentRequest,
  amount: number,
): Promise<PaymentInitialisation> {
  let response: Response;
  try {
    response = await fetch(`${paystackBase()}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: request.email,
        amount: toMinorUnits(request.amount),
        currency: request.currency,
        reference: request.reference,
        description: request.description,
        callback_url: request.callbackUrl,
        metadata: request.metadata ?? {},
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    return {
      ...providerFail(
        "paystack",
        `The payment provider could not be reached: ${(error as Error).message}`,
      ),
      authorizationUrl: null,
      reference: null,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; reference?: string };
  };

  if (!response.ok || !payload.status || !payload.data?.authorization_url) {
    return {
      ...providerFail(
        "paystack",
        payload.message ?? `The payment provider refused the request (${response.status}).`,
      ),
      authorizationUrl: null,
      reference: payload.data?.reference ?? null,
    };
  }

  return {
    ...providerOk("paystack", payload.data.reference ?? request.reference),
    authorizationUrl: payload.data.authorization_url,
    reference: payload.data.reference ?? request.reference,
  };
}

async function initialiseFlutterwave(
  secretKey: string,
  publicKey: string | null,
  request: PaymentRequest,
  amount: number,
): Promise<PaymentInitialisation> {
  let response: Response;
  try {
    response = await fetch(`${flutterwaveBase()}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: request.reference,
        amount,
        currency: request.currency,
        redirect_url: request.callbackUrl,
        customer: { email: request.email },
        customizations: { title: request.description },
        meta: request.metadata ?? {},
        ...(publicKey ? { client: publicKey } : {}),
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    return {
      ...providerFail(
        "flutterwave",
        `The payment provider could not be reached: ${(error as Error).message}`,
      ),
      authorizationUrl: null,
      reference: null,
    };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    data?: { link?: string; tx_ref?: string };
  };

  if (!response.ok || payload.status !== "success" || !payload.data?.link) {
    return {
      ...providerFail(
        "flutterwave",
        payload.message ?? `The payment provider refused the request (${response.status}).`,
      ),
      authorizationUrl: null,
      reference: payload.data?.tx_ref ?? null,
    };
  }

  return {
    ...providerOk("flutterwave", payload.data.tx_ref ?? request.reference),
    authorizationUrl: payload.data.link,
    reference: payload.data.tx_ref ?? request.reference,
  };
}

export type VerifiedPayment = {
  ok: boolean;
  paid: boolean;
  reference: string | null;
  amount: string | null;
  currency: string | null;
  paidAt: string | null;
  error: string | null;
};

/** Ask the provider whether a reference was really paid. */
export async function verifyPayment(
  reference: string,
): Promise<VerifiedPayment> {
  const config = paymentsConfig();
  if (!config.provider || !config.secretKey) {
    return {
      ok: false,
      paid: false,
      reference,
      amount: null,
      currency: null,
      paidAt: null,
      error: "No payment provider is configured.",
    };
  }
  if (config.provider === "paystack") {
    return verifyPaystack(config.secretKey, reference);
  }
  return verifyFlutterwave(config.secretKey, reference);
}

async function verifyPaystack(
  secretKey: string,
  reference: string,
): Promise<VerifiedPayment> {
  const empty: VerifiedPayment = {
    ok: false,
    paid: false,
    reference,
    amount: null,
    currency: null,
    paidAt: null,
    error: null,
  };
  let response: Response;
  try {
    response = await fetch(
      `${paystackBase()}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    return { ...empty, error: `The payment provider could not be reached: ${(error as Error).message}` };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      paid_at?: string | null;
      reference?: string;
    };
  };

  if (!response.ok || !payload.status || !payload.data) {
    return {
      ...empty,
      error:
        payload.message ?? `The payment provider could not confirm the payment (${response.status}).`,
    };
  }

  const paid = payload.data.status === "success";
  return {
    ok: true,
    paid,
    reference: payload.data.reference ?? reference,
    amount:
      typeof payload.data.amount === "number"
        ? fromMinorUnits(payload.data.amount)
        : null,
    currency: payload.data.currency ?? null,
    paidAt: payload.data.paid_at ?? null,
    error: paid ? null : `The payment is "${payload.data.status ?? "unknown"}".`,
  };
}

async function verifyFlutterwave(
  secretKey: string,
  reference: string,
): Promise<VerifiedPayment> {
  const empty: VerifiedPayment = {
    ok: false,
    paid: false,
    reference,
    amount: null,
    currency: null,
    paidAt: null,
    error: null,
  };
  let response: Response;
  try {
    response = await fetch(
      `${flutterwaveBase()}/transactions/${encodeURIComponent(reference)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    return { ...empty, error: `The payment provider could not be reached: ${(error as Error).message}` };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    status?: string;
    message?: string;
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      created_at?: string;
      tx_ref?: string;
    };
  };

  if (!response.ok || payload.status !== "success" || !payload.data) {
    return {
      ...empty,
      error:
        payload.message ?? `The payment provider could not confirm the payment (${response.status}).`,
    };
  }

  const paid = payload.data.status === "successful";
  return {
    ok: true,
    paid,
    reference: payload.data.tx_ref ?? reference,
    amount:
      typeof payload.data.amount === "number" ? payload.data.amount.toFixed(2) : null,
    currency: payload.data.currency ?? null,
    paidAt: paid ? (payload.data.created_at ?? null) : null,
    error: paid ? null : `The payment is "${payload.data.status ?? "unknown"}".`,
  };
}
