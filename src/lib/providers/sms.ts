/**
 * SMS through Hubtel.
 *
 * Hubtel is the network the company already buys airtime from, so it is the
 * SMS provider the system talks to. The call is the documented "Quick Send"
 * endpoint: HTTP basic authentication with the client id and client secret,
 * a JSON body, and a reply that names the status of the message.
 *
 * When no credentials are set the provider refuses to send and says why, so
 * the message row is recorded as in-app only instead of a silent no-op.
 */
import { toE164 } from "./phone";
import { providerFail, providerOk, type ProviderResult } from "./types";

const ENDPOINT = "https://api.hubtel.com/v1/messages/send";

export type SmsProviderConfig = {
  clientId: string;
  clientSecret: string;
  senderId: string;
  endpoint: string;
};

/**
 * Read the SMS credentials from the environment.
 *
 * `SMS_PROVIDER_CLIENT_ID` and `SMS_PROVIDER_CLIENT_SECRET` are the Hubtel
 * pair. `SMS_PROVIDER_API_KEY` is accepted as a fallback for the client id so
 * an operator who pasted a single key still gets a clear error instead of a
 * silent failure.
 */
export function smsConfig(): SmsProviderConfig | null {
  const provider = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (provider && provider !== "hubtel") return null;

  const clientId = (
    process.env.SMS_PROVIDER_CLIENT_ID ??
    process.env.SMS_PROVIDER_API_KEY ??
    ""
  ).trim();
  const clientSecret = (process.env.SMS_PROVIDER_CLIENT_SECRET ?? "").trim();
  const senderId = (process.env.SMS_PROVIDER_SENDER_ID ?? "").trim();
  if (!clientId || !clientSecret || !senderId) return null;

  return {
    clientId,
    clientSecret,
    senderId,
    endpoint: process.env.SMS_PROVIDER_ENDPOINT?.trim() || ENDPOINT,
  };
}

/** Whether a real SMS provider is behind the app right now. */
export function smsProviderReady(): boolean {
  return smsConfig() !== null;
}

function readField(body: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    for (const key of Object.keys(body)) {
      if (key.toLowerCase() === name.toLowerCase()) {
        const value = body[key];
        if (value !== null && value !== undefined && value !== "") {
          return String(value);
        }
      }
    }
  }
  return null;
}

/**
 * Send one text message.
 *
 * A number that cannot be read is refused before the request leaves the
 * server, and the refusal names the reason.
 */
export async function sendSms(
  to: string,
  content: string,
): Promise<ProviderResult> {
  const config = smsConfig();
  if (!config) {
    return providerFail(
      "hubtel",
      "No SMS provider is configured. Set SMS_PROVIDER_CLIENT_ID, SMS_PROVIDER_CLIENT_SECRET and SMS_PROVIDER_SENDER_ID.",
    );
  }

  const number = toE164(to);
  if (!number) {
    return providerFail("hubtel", `The number "${to}" is not a usable phone number.`);
  }
  const text = content.trim();
  if (!text) {
    return providerFail("hubtel", "The message is empty.");
  }

  const authorization = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: config.senderId,
        To: number,
        Content: text,
        RegisteredDelivery: "true",
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return providerFail(
      "hubtel",
      `The SMS provider could not be reached: ${(error as Error).message}`,
    );
  }

  const raw = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    const maybe = JSON.parse(raw) as unknown;
    if (maybe && typeof maybe === "object") {
      const record = maybe as Record<string, unknown>;
      parsed = Array.isArray(record) ? (record[0] as Record<string, unknown>) ?? {} : record;
    }
  } catch {
    parsed = {};
  }

  const status = readField(parsed, "Status", "status");
  const messageId = readField(parsed, "MessageId", "messageId", "MessageID", "id");
  const detail = readField(parsed, "Message", "message", "Description");

  if (!response.ok) {
    return providerFail(
      "hubtel",
      detail
        ? `The SMS provider refused the message (${response.status}): ${detail}`
        : `The SMS provider refused the message (${response.status}).`,
      messageId,
    );
  }

  if (status && !/success/i.test(status)) {
    return providerFail(
      "hubtel",
      detail ? `${status}: ${detail}` : `The SMS provider reported "${status}".`,
      messageId,
    );
  }

  return providerOk("hubtel", messageId);
}
