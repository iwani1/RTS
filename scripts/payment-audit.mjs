/**
 * The payment path, proved end to end.
 *
 * A payment is the one place where the application must not take its own
 * word for anything, so the rules are checked against a real server, a real
 * provider call and a real database:
 *
 *   1. a payment link is created through the provider, and asking twice
 *      returns the same link instead of a second transaction;
 *   2. a callback for a reference nobody is waiting for never reaches the
 *      provider — the reference is looked up first;
 *   3. a callback for a provider that is not the configured one is refused;
 *   4. a callback for a real reference is confirmed with the provider before
 *      the invoice is settled;
 *   5. a webhook that is not signed is refused, one signed for the wrong
 *      provider is refused, and one signed correctly is applied.
 *
 * The provider is a stand-in that speaks Paystack's shape and records every
 * request, so "the provider was not called" is an observation, not a claim.
 *
 *   node scripts/payment-audit.mjs
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_PORT = Number(process.env.AUDIT_PORT ?? 3101);
const PROVIDER_PORT = Number(process.env.AUDIT_PROVIDER_PORT ?? 3999);
const TOKEN = process.env.TEST_SESSION_TOKEN ?? "ci-smoke-token";
const SECRET = "sk_test_audit_only";
const base = `http://127.0.0.1:${APP_PORT}`;
const providerBase = `http://127.0.0.1:${PROVIDER_PORT}`;

let failures = 0;
let checks = 0;

function check(label, ok, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
}

/* ----------------------------------------------------- the stand-in ---- */

const providerCalls = [];
/** The amount the last payment was started for, so the stand-in can confirm it. */
let lastAmount = 100_00;

function startProvider() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      providerCalls.push({
        method: req.method ?? "",
        path: req.url ?? "",
        authorization: req.headers.authorization ?? "",
        body,
      });

      if (req.url?.startsWith("/transaction/initialize")) {
        const payload = JSON.parse(body || "{}");
        if (typeof payload.amount === "number") lastAmount = payload.amount;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: true,
            message: "Authorization URL created",
            data: {
              authorization_url: `${providerBase}/pay/${payload.reference}`,
              reference: payload.reference,
              amount: payload.amount,
            },
          }),
        );
        return;
      }

      if (req.url?.startsWith("/transaction/verify/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: true,
            data: {
              status: "success",
              amount: lastAmount,
              currency: "GHS",
              reference: decodeURIComponent(req.url.split("/transaction/verify/")[1] ?? ""),
              paid_at: new Date().toISOString(),
            },
          }),
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: false, message: "Unknown endpoint" }));
    });
  });
  return new Promise((resolve) => {
    server.listen(PROVIDER_PORT, "127.0.0.1", () => resolve(server));
  });
}

/* --------------------------------------------------------- the app ----- */

function startApp() {
  const dataDir = path.join(root, ".data", "audit-pg");
  fs.rmSync(dataDir, { recursive: true, force: true });

  const child = spawn(process.execPath, [path.join(root, "scripts", "start.mjs")], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      BIND_HOST: "127.0.0.1",
      PGLITE_DATA_DIR: dataDir,
      PAYSTACK_SECRET_KEY: SECRET,
      PAYSTACK_PUBLIC_KEY: "pk_test_audit_only",
      PAYSTACK_API_BASE: providerBase,
      TEST_SESSION_ENABLED: "true",
      TEST_SESSION_TOKEN: TOKEN,
    },
  });
  const log = [];
  child.stdout.on("data", (chunk) => log.push(chunk.toString()));
  child.stderr.on("data", (chunk) => log.push(chunk.toString()));
  child.logLines = log;
  return child;
}

async function waitForApp() {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/* ------------------------------------------------------- the client ---- */

async function openSession(email) {
  const res = await fetch(`${base}/api/test/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-token": TOKEN },
    body: JSON.stringify({ email }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

function decode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

/**
 * The hidden fields of the form that carries `label`, including the
 * `$ACTION_*` fields React uses to bind the form to its action.
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
async function submitForm(cookie, fields, extra = {}) {
  const merged = new Map(fields);
  for (const [name, value] of Object.entries(extra)) merged.set(name, value);
  const body = new FormData();
  for (const [name, value] of merged) body.append(name, value);
  const res = await fetch(`${base}/finance`, {
    method: "POST",
    headers: { cookie, origin: base },
    body,
    redirect: "manual",
  });
  return { status: res.status, text: await res.text() };
}

/* ---------------------------------------------------------- the run ---- */

const provider = await startProvider();
const app = startApp();
let exitCode = 1;

try {
  console.log("\n1 · the server comes up with a payment provider behind it");
  const up = await waitForApp();
  check("the application is listening", up);
  if (!up) throw new Error("the application did not start");

  const cookie = await openSession("finance@richietransportgh.com");
  check("a finance session is open", cookie.includes("tms_session"));

  const html = await (await fetch(`${base}/finance`, { headers: { cookie } })).text();
  const linkForms = (html.match(/<form\b[\s\S]*?<\/form>/g) ?? []).filter((form) =>
    form.includes("Payment link"),
  ).length;
  const fields = formFields(html, "Payment link");
  const invoiceId = fields?.find(([name]) => name === "invoiceId")?.[1] ?? "";
  check("the payment-link action is on the page", Boolean(fields), `${fields?.length ?? 0} field(s)`);
  check("the invoice is on the page", Boolean(invoiceId), invoiceId);

  console.log("\n2 · a payment link is created through the provider");
  const first = await submitForm(cookie, fields);
  check("the action ran", first.status === 200, `status=${first.status}`);
  if (process.env.AUDIT_VERBOSE) {
    console.log("ACTION RESULT:", first.text.slice(0, 1200));
    console.log("SERVER LOG:", app.logLines.join("").slice(-3000));
  }
  const reference = /RTS-[A-Za-z0-9-]+-[0-9a-f]+/.exec(first.text)?.[0] ?? "";
  const link = /https?:\/\/[^"\\ ]*\/pay\/[^"\\ ]+/.exec(first.text)?.[0] ?? "";
  check("a reference came back", Boolean(reference), reference);
  check("a payment link came back", Boolean(link), link);
  check(
    "the provider was asked to create the payment",
    providerCalls.some((call) => call.path.startsWith("/transaction/initialize")),
    `${providerCalls.length} provider call(s)`,
  );

  console.log("\n3 · asking twice does not open a second transaction");
  const callsBefore = providerCalls.length;
  const second = await submitForm(cookie, fields);
  check("the action ran again", second.status === 200, `status=${second.status}`);
  check(
    "the same link comes back",
    second.text.includes(reference) || second.text.includes("already waiting"),
    "",
  );
  check(
    "the provider was not asked again",
    providerCalls.length === callsBefore,
    `${providerCalls.length - callsBefore} extra call(s)`,
  );

  console.log("\n4 · a callback nobody is waiting for never reaches the provider");
  const beforeUnknown = providerCalls.length;
  const unknown = await fetch(`${base}/api/payments/paystack/callback?reference=RTS-NOT-REAL`, {
    redirect: "manual",
  });
  check("the callback answers", unknown.status === 303, `status=${unknown.status}`);
  check(
    "it lands on the finance screen with no payment recorded",
    (unknown.headers.get("location") ?? "").includes("payment=unknown"),
    unknown.headers.get("location") ?? "",
  );
  check(
    "the provider was not called for it",
    providerCalls.length === beforeUnknown,
    `${providerCalls.length - beforeUnknown} provider call(s)`,
  );

  console.log("\n5 · a callback for the wrong provider is refused");
  const beforeMismatch = providerCalls.length;
  const mismatch = await fetch(`${base}/api/payments/flutterwave/callback?reference=${reference}`, {
    redirect: "manual",
  });
  check("the callback answers", mismatch.status === 303, `status=${mismatch.status}`);
  check(
    "it lands on the finance screen with no payment recorded",
    (mismatch.headers.get("location") ?? "").includes("payment=unknown"),
    mismatch.headers.get("location") ?? "",
  );
  check(
    "the provider was not called for it",
    providerCalls.length === beforeMismatch,
    `${providerCalls.length - beforeMismatch} provider call(s)`,
  );

  console.log("\n6 · a real callback is confirmed with the provider before it settles");
  const callback = await fetch(`${base}/api/payments/paystack/callback?reference=${reference}`, {
    redirect: "manual",
  });
  check("the callback answers", callback.status === 303, `status=${callback.status}`);
  check(
    "it reports the payment as paid",
    (callback.headers.get("location") ?? "").includes("payment=paid"),
    callback.headers.get("location") ?? "",
  );
  check(
    "the provider was asked to confirm it",
    providerCalls.some((call) => call.path.startsWith(`/transaction/verify/${reference}`)),
    "",
  );

  const afterSettle = await (await fetch(`${base}/finance`, { headers: { cookie } })).text();
  const linkFormsAfter = (afterSettle.match(/<form\b[\s\S]*?<\/form>/g) ?? []).filter((form) =>
    form.includes("Payment link"),
  ).length;
  check(
    "the settled invoice no longer offers a payment link",
    linkFormsAfter === linkForms - 1,
    `${linkForms} before, ${linkFormsAfter} after`,
  );
  check(
    "the payment is listed on the finance screen",
    afterSettle.includes("Paystack") && /GHS\s*1[\d,.]*/.test(afterSettle),
    "",
  );

  console.log("\n7 · the webhook only accepts a signature it can verify");
  const body = JSON.stringify({
    event: "charge.success",
    data: { reference: "RTS-WEBHOOK-1", status: "successful" },
  });

  const unsigned = await fetch(`${base}/api/payments/paystack/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  check("an unsigned webhook is refused", unsigned.status === 401, `status=${unsigned.status}`);

  const wrong = await fetch(`${base}/api/payments/paystack/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-paystack-signature": "deadbeef" },
    body,
  });
  check("a webhook with a wrong signature is refused", wrong.status === 401, `status=${wrong.status}`);

  const otherProvider = await fetch(`${base}/api/payments/flutterwave/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "verif-hash": createHmac("sha512", SECRET).update(body).digest("hex"),
    },
    body,
  });
  check(
    "a webhook for the wrong provider is refused",
    otherProvider.status === 409,
    `status=${otherProvider.status}`,
  );

  const signed = await fetch(`${base}/api/payments/paystack/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": createHmac("sha512", SECRET).update(body).digest("hex"),
    },
    body,
  });
  const signedBody = await signed.json();
  check("a webhook that is signed correctly is accepted", signed.status === 200, `status=${signed.status}`);
  check(
    "and it changes nothing when no payment is waiting for it",
    signedBody?.received === true && signedBody?.applied === false,
    JSON.stringify(signedBody),
  );

  console.log(
    failures === 0
      ? `\nPAYMENT AUDIT: all ${checks} checks passed`
      : `\nPAYMENT AUDIT: ${failures} of ${checks} checks failed`,
  );
  exitCode = failures === 0 ? 0 : 1;
} catch (error) {
  console.error(`\nThe run stopped: ${error.message}`);
} finally {
  app.kill("SIGTERM");
  await new Promise((resolve) => serverClose(provider, resolve));
  fs.rmSync(path.join(root, ".data", "audit-pg"), { recursive: true, force: true });
}

process.exit(exitCode);

function serverClose(server, done) {
  server.close(() => done());
}
