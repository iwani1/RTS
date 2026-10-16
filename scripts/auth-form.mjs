/**
 * End-to-end check of the native (no-JavaScript) authentication path.
 *
 * The public auth screens post to a route handler with a plain HTML form, so
 * this script exercises the same request a browser without JavaScript makes:
 * form-urlencoded POST, expect a redirect, then confirm the session cookie
 * opens an authenticated page.
 *
 * Usage: node scripts/auth-form.mjs [baseUrl]
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:3000" },
    email: { type: "string", default: "admin@staffridegh.com" },
    password: { type: "string", default: "Password123!" },
    code: { type: "string", default: "246810" },
  },
});

const base = values.url.replace(/\/$/, "");
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function sessionCookie(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const match = /^([A-Za-z0-9_]+)=([^;]*)/.exec(cookie);
    if (match) return `${match[1]}=${match[2]}`;
  }
  return "";
}

// 1. Reject bad credentials with a friendly message, not a 500.
//
// The failed attempt is made against a throwaway identifier, not the real
// account. The sign-in throttle counts failures per identifier and locks an
// account after five tries in fifteen minutes, so a failure aimed at the
// administrator would lock the administrator out of the very next run — and
// of the browser session the operator is using.
{
  const body = new URLSearchParams({
    email: `failed-probe-${Date.now()}@staffridegh.com`,
    password: "definitely-not-the-password",
    code: values.code,
  });
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin: base },
    body,
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";
  check(
    "a failed sign-in -> redirect back to /login",
    response.status === 303 && location.includes("/login?error="),
    `status=${response.status}`,
  );
  check(
    "a failed sign-in -> no session cookie",
    sessionCookie(response) === "",
    sessionCookie(response) ? "a cookie was issued" : "",
  );
}

// 2. Sign in with correct credentials and capture the session cookie.
let cookie = "";
{
  const body = new URLSearchParams({
    email: values.email,
    password: values.password,
    code: values.code,
  });
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin: base },
    body,
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";
  cookie = sessionCookie(response);
  check(
    "valid credentials -> redirect to the landing route",
    (response.status === 303 || response.status === 307) &&
      /\/dashboard|\/dispatch|\/$/.test(location),
    `status=${response.status} location=${location}`,
  );
  check("session cookie issued", cookie !== "", cookie.slice(0, 28) + "...");
}

// 3. The session must actually open an authenticated page.
if (cookie) {
  const response = await fetch(`${base}/dashboard`, {
    headers: { cookie },
    redirect: "manual",
  });
  const html = await response.text();
  check(
    "session opens /dashboard",
    response.status === 200 && !html.includes("Sign in</h1>"),
    `status=${response.status}`,
  );
  check(
    "dashboard shows the signed-in operator",
    html.includes("Nana Kojo Admin") || html.includes("Sign out"),
    "",
  );
}

// 4. Signing out must clear the session.
{
  const response = await fetch(`${base}/api/auth/logout`, {
    method: "POST",
    headers: { origin: base, ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  check(
    "logout redirects to /login",
    response.status === 307 || response.status === 303 || response.status === 302,
    `status=${response.status}`,
  );
}

// 5. A cross-site form post must be refused.
//
//    The public auth screens post to route handlers so they work without
//    JavaScript. Route handlers do not carry React's own origin check, so
//    the application checks the origin itself. A page on another site must
//    not be able to drive a sign-in, a sign-out or a password reset here.
{
  const body = new URLSearchParams({
    email: values.email,
    password: values.password,
    code: values.code,
  });
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { origin: "https://attacker.example" },
    body,
    redirect: "manual",
  });
  check(
    "a cross-site sign-in is refused",
    response.status === 403,
    `status=${response.status}`,
  );
  check(
    "a cross-site sign-in issues no session",
    sessionCookie(response) === "",
    sessionCookie(response) ? "a cookie was issued" : "",
  );
}

// 6. The password-reset request endpoint must answer without leaking whether
//    the account exists for an unknown address.
{
  const body = new URLSearchParams({ email: "nobody@nowhere.test" });
  const response = await fetch(`${base}/api/auth/forgot-password`, {
    headers: { origin: base },
    method: "POST",
    body,
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";
  check(
    "unknown account -> neutral notice",
    response.status === 303 && /notice=/.test(location),
    `status=${response.status}`,
  );
}

console.log(
  failures === 0
    ? "\nNATIVE AUTH FORMS: all checks passed"
    : `\nNATIVE AUTH FORMS: ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
