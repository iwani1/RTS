/**
 * The provider registry.
 *
 * One place decides which vendor handles a message, and one place reports
 * what is actually live. The interface in the product — the settings screen,
 * the sign-in page, the operations screen — reads this, so the interface can
 * never claim a channel is on when nothing is behind it.
 */
import { emailConfig, emailProviderReady, sendEmail } from "./email";
import { smsConfig, smsProviderReady, sendSms } from "./sms";
import { maskPhone, toE164 } from "./phone";
import type { ProviderResult } from "./types";

export type ProviderStatus = {
  sms: { ready: boolean; name: string; detail: string };
  email: { ready: boolean; name: string; detail: string };
  map: { ready: boolean; name: string; detail: string };
  sso: { ready: boolean; name: string; detail: string };
  payments: { ready: boolean; name: string; detail: string };
};

/** Read the map credentials the browser will use. */
export function mapProvider(): { provider: string; token: string | null } {
  const provider = (process.env.NEXT_PUBLIC_MAP_PROVIDER ?? "").trim().toLowerCase();
  const token = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "").trim();
  return { provider: provider || "mapbox", token: token || null };
}

/** Read the OIDC settings the sign-in page needs. */
export function ssoProvider(): { ready: boolean; issuer: string | null; clientId: string | null } {
  const issuer = (process.env.OIDC_ISSUER ?? "").trim();
  const clientId = (process.env.OIDC_CLIENT_ID ?? "").trim();
  return { ready: Boolean(issuer && clientId), issuer: issuer || null, clientId: clientId || null };
}

/** Read the payment credentials. */
export function paymentsProvider(): { ready: boolean; name: string } {
  if (process.env.PAYSTACK_SECRET_KEY) return { ready: true, name: "paystack" };
  if (process.env.FLUTTERWAVE_SECRET_KEY) return { ready: true, name: "flutterwave" };
  return { ready: false, name: "none" };
}

/**
 * What is live right now.
 *
 * The result is shown to operators and to users, so each entry says what is
 * behind it — a vendor name, or the reason it is off.
 */
export function providerStatus(): ProviderStatus {
  const sms = smsConfig();
  const email = emailConfig();
  const map = mapProvider();
  const sso = ssoProvider();
  const payments = paymentsProvider();

  return {
    sms: {
      ready: smsProviderReady(),
      name: sms ? "hubtel" : "not configured",
      detail: sms
        ? `Hubtel is live with the sender id ${sms.senderId}.`
        : "No SMS provider is configured, so messages stay inside the app.",
    },
    email: {
      ready: emailProviderReady(),
      name: email ? "smtp" : "not configured",
      detail: email
        ? `Mail is delivered through ${email.host}:${email.port}.`
        : "No mail server is configured, so messages stay inside the app.",
    },
    map: {
      ready: Boolean(map.token),
      name: map.token ? "mapbox" : "not configured",
      detail: map.token
        ? "The live map draws a real Mapbox basemap."
        : "The live map draws the built-in corridor, with no external tiles.",
    },
    sso: {
      ready: sso.ready,
      name: sso.ready ? "oidc" : "not configured",
      detail: sso.ready
        ? `Single sign-on is live through ${sso.issuer}.`
        : "No identity provider is configured, so accounts use email and password.",
    },
    payments: {
      ready: payments.ready,
      name: payments.name,
      detail: payments.ready
        ? `Invoices can be paid through ${payments.name}.`
        : "No payment provider is configured, so invoices are settled by bank transfer.",
    },
  };
}

export { sendSms, sendEmail, toE164, maskPhone };
export { smsProviderReady } from "./sms";
export { emailProviderReady } from "./email";
export type { ProviderResult };
