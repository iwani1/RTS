/**
 * Verifies the server-action transport on a running server.
 *
 * The public auth screens post to route handlers so they work without
 * JavaScript. Everything inside the authenticated app still uses React server
 * actions, which the browser invokes with a `Next-Action` header. This script
 * replays that request shape against two real actions and asserts that:
 *
 *   1. the action reference rendered on the page resolves to a live action;
 *   2. the action actually runs and returns its result;
 *   3. the action guard turns a bad payload into a structured, friendly
 *      error instead of a 500.
 *
 * Usage: node scripts/action-invoke.mjs [baseUrl]
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:3000" },
    token: { type: "string", default: "ci-smoke-token" },
  },
});

const base = values.url.replace(/\/$/, "");
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function decode(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'");
}

/** The hidden `$ACTION_*` fields of the form that carries `label`. */
function extractActionId(html, label) {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
  for (const form of forms) {
    if (!form.includes(label)) continue;
    for (const match of form.matchAll(/<input\b[^>]*>/g)) {
      const tag = match[0];
      const name = /\bname="([^"]*)"/.exec(tag)?.[1] ?? "";
      if (!name.endsWith(":0")) continue;
      const raw = /\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "";
      return JSON.parse(decode(raw)).id;
    }
  }
  return null;
}

async function openSession(email) {
  const response = await fetch(`${base}/api/test/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-token": values.token },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) return "";
  return (response.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** Invoke a server action the way the browser's React runtime does. */
async function invoke(cookie, path, actionId, args) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      cookie,
      "Next-Action": actionId,
      "content-type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  return { status: response.status, text: await response.text() };
}

// 1. An idempotent action that ignores its payload: it must report success.
{
  const cookie = await openSession("admin@richietransportgh.com");
  check("QA session opened", cookie.includes("tms_session"), "");

  const html = await (
    await fetch(`${base}/settings`, { headers: { cookie } })
  ).text();
  const actionId = extractActionId(html, "Mark all read");
  check("action reference rendered", Boolean(actionId), actionId ?? "");

  if (actionId) {
    const { status, text } = await invoke(cookie, "/settings", actionId, [null, {}]);
    check("action executes", status === 200, `status=${status}`);
    check(
      "action result returned to the client",
      text.includes("All notifications marked as read"),
      "",
    );
  }
}

// 2. An action that reads its payload: a missing field must produce a
//    structured error, not a 500.
{
  const cookie = await openSession("dispatch@richietransportgh.com");
  const html = await (
    await fetch(`${base}/bookings`, { headers: { cookie } })
  ).text();
  const actionId = extractActionId(html, "Approve");
  check("second action reference rendered", Boolean(actionId), actionId ?? "");

  if (actionId) {
    const { status, text } = await invoke(cookie, "/bookings", actionId, [
      null,
      {},
    ]);
    check("guarded action returns a result", status === 200, `status=${status}`);
    check(
      "validation failure is a structured error, not a crash",
      /"ok":false/.test(text) && !/"digest"/.test(text),
      "",
    );
  }
}

console.log(
  failures === 0
    ? "\nSERVER ACTION TRANSPORT: all checks passed"
    : `\nSERVER ACTION TRANSPORT: ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
