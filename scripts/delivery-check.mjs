#!/usr/bin/env node
/**
 * End-to-end check of message delivery.
 *
 * A stand-in SMS gateway runs on this machine. The check then drives the
 * real application: an operator asks for a test message, the application
 * calls the gateway the way Hubtel is called, and the answer is written
 * into the notification log with the provider's message id. The check also
 * confirms that a message the gateway refuses is recorded as a failure
 * rather than as sent.
 *
 * The application must be started with the gateway's address:
 *
 *   SMS_PROVIDER=hubtel \
 *   SMS_PROVIDER_CLIENT_ID=demo \
 *   SMS_PROVIDER_CLIENT_SECRET=demo \
 *   SMS_PROVIDER_SENDER_ID=RTSTest \
 *   SMS_PROVIDER_ENDPOINT=http://127.0.0.1:4312/v1/messages/send \
 *   npm start
 *
 * The check reads SMS_PROVIDER_CLIENT_ID and SMS_PROVIDER_CLIENT_SECRET from
 * the environment as well, so it can prove the request was authenticated with
 * the credentials the server is using.
 *
 * Usage: node scripts/delivery-check.mjs [baseUrl]
 */
import http from "node:http";

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const GATEWAY_PORT = Number(process.env.SMS_GATEWAY_PORT ?? 4312);
const TOKEN = process.env.TEST_SESSION_TOKEN ?? "ci-smoke-token";
// The credentials the server was started with, so the check can prove the
// request was authenticated with them.
const CLIENT_ID = process.env.SMS_PROVIDER_CLIENT_ID ?? "demo";
const CLIENT_SECRET = process.env.SMS_PROVIDER_CLIENT_SECRET ?? "demo";

let failures = 0;
const received = [];
let refuse = false;

function check(name, condition, detail = "") {
  if (!condition) failures += 1;
  console.log(`  ${condition ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

function decode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * The hidden fields of the form that carries `label`, including the
 * `$ACTION_*` field React uses to bind the form to its action.
 */
function formFields(html, label) {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
  for (const form of forms) {
    if (!form.includes(label)) continue;
    const fields = [];
    for (const match of form.matchAll(/<input\b[^>]*>/g)) {
      const tag = match[0];
      const name = /\bname="([^"]*)"/.exec(tag)?.[1];
      if (!name) continue;
      const raw = /\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "";
      fields.push([name, decode(raw)]);
    }
    return fields;
  }
  return null;
}

/** Submit a form the way a browser without JavaScript would. */
async function submitForm(cookie, path, fields, extra = {}) {
  const merged = new Map(fields);
  for (const [name, value] of Object.entries(extra)) merged.set(name, value);
  const body = new FormData();
  for (const [name, value] of merged) body.append(name, value);
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie, origin: BASE },
    body,
    redirect: "manual",
  });
  const text = await response.text();
  const okMatch = text.match(/\\?"ok\\?":(true|false)/);
  const msgMatch = text.match(/\\?"message\\?":\\?"((?:[^"\\]|\\.)*?)\\?"/);
  return {
    status: response.status,
    text,
    result: okMatch
      ? { ok: okMatch[1] === "true", message: msgMatch ? msgMatch[1] : null }
      : null,
  };
}

async function openSession(email) {
  const response = await fetch(`${BASE}/api/test/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-token": TOKEN },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) return "";
  return (response.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function startGateway() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push({
        path: req.url ?? "",
        authorization: req.headers.authorization,
        body,
      });
      if (refuse) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ Status: "Error", Message: "Sender id not approved" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          Status: "Success",
          StatusCode: 200,
          Message: "Message Submitted",
          MessageId: `GATE-${received.length}`,
        }),
      );
    });
  });
  return server;
}

async function main() {
  const gateway = startGateway();
  await new Promise((resolve) => gateway.listen(GATEWAY_PORT, "127.0.0.1", resolve));

  try {
    const cookie = await openSession("admin@richietransportgh.com");
    check("a session is opened", cookie.includes("tms_session="));

    const html = await (await fetch(`${BASE}/settings`, { headers: { cookie } })).text();
    check("the gateway check is on the settings screen", html.includes("Send a test message"));
    const fields = formFields(html, "Send a test message");
    check("the form is bound to its action", Boolean(fields) && fields.length > 0);

    if (fields) {
      // 1. A message the gateway accepts.
      const sent = await submitForm(cookie, "/settings", fields, {
        channel: "sms",
        // The address is deliberately somebody else's: the check must still
        // go to the operator's own number, never to an address a form field
        // chooses.
        to: "0244012345",
        body: "Delivery check from RTS.",
      });
      check("the action runs", sent.status === 200, `status=${sent.status}`);
      check(
        "the action reports the provider's answer",
        Boolean(sent.result?.ok) && String(sent.result?.message).includes("accepted the message"),
        String(sent.result?.message ?? sent.text.slice(0, 160)),
      );
      check(
        "the provider's message id is shown",
        String(sent.result?.message ?? "").includes("GATE-1"),
        String(sent.result?.message ?? ""),
      );

      check("the gateway received one request", received.length === 1, `${received.length}`);
      const call = received[0];
      check("the request went to the send endpoint", call.path.includes("/v1/messages/send"), call.path);
      check(
        "the request was authenticated",
        call.authorization === `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
        call.authorization ?? "",
      );
      const body = JSON.parse(call.body);
      check(
        "the message went to the operator's own number, not to the address in the form",
        body.To === "+233241110001",
        body.To,
      );
      check("the sender id was sent", Boolean(body.From), body.From);
      check("the message was sent verbatim", body.Content === "Delivery check from RTS.", body.Content);

      // 2. The message is in the notification log as sent.
      const log = await (await fetch(`${BASE}/settings`, { headers: { cookie } })).text();
      check("the log records the delivery as sent", log.includes("Delivery:") && log.includes("sent"));

      // 3. A message the gateway refuses is recorded as a failure.
      refuse = true;
      const failed = await submitForm(cookie, "/settings", fields, {
        channel: "sms",
        to: "0244012345",
        body: "This one is refused.",
      });
      check(
        "the refused message also went to the operator's own number",
        received.length === 2 && JSON.parse(received[1].body).To === "+233241110001",
        received.length === 2 ? JSON.parse(received[1].body).To : `${received.length} requests`,
      );
      check(
        "a refusal is reported, not swallowed",
        String(failed.result?.message ?? "").includes("not sent") &&
          String(failed.result?.message ?? "").includes("Sender id not approved"),
        String(failed.result?.message ?? failed.text.slice(0, 200)),
      );
    }
  } finally {
    await new Promise((resolve) => gateway.close(resolve));
  }

  console.log(
    failures === 0
      ? "\nMESSAGE DELIVERY: all checks passed"
      : `\nMESSAGE DELIVERY: ${failures} check(s) failed`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nThe delivery check could not run: ${error.message}`);
  console.error(
    "Start the application with SMS_PROVIDER, SMS_PROVIDER_CLIENT_ID, SMS_PROVIDER_CLIENT_SECRET, SMS_PROVIDER_SENDER_ID and SMS_PROVIDER_ENDPOINT, then try again.",
  );
  process.exit(1);
});
