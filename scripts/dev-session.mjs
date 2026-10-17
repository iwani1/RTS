/**
 * Local QA helper — signs in through the real login form and prints the
 * session cookie.
 *
 *   node scripts/dev-session.mjs admin@richietransportgh.com "Password123!" 246810
 *   curl -H "Cookie: tms_session=<token>" http://127.0.0.1:3000/dashboard
 *
 * It drives the actual React Server Action over HTTP — the same request a
 * browser without JavaScript makes — so the session is created by the running
 * server and the PGlite data directory is never opened by a second process.
 */
const base = process.env.BASE_URL || "http://127.0.0.1:3000";

const email = process.argv[2] || "admin@richietransportgh.com";
const password = process.argv[3] || "Password123!";
const code = process.argv[4] || "";

/** Decode the HTML entities Next.js writes into the hidden action fields. */
function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// 1. Load the login page and capture the server-action form.
const page = await fetch(`${base}/login`, { redirect: "manual" });
const html = await page.text();

const formMatch = html.match(/<form[^>]*>([\s\S]*?)<\/form>/);
if (!formMatch) {
  console.error("Could not find the login form on /login.");
  process.exit(1);
}
const inner = formMatch[1];

// React 19 encodes a bound server action as a set of hidden fields
// ($ACTION_REF_*, $ACTION_<id>:0, …). They must be posted back verbatim.
const hidden = [];
for (const m of inner.matchAll(
  /<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/g,
)) {
  hidden.push([decodeEntities(m[1]), decodeEntities(m[2])]);
}
for (const m of inner.matchAll(
  /<input[^>]*name="([^"]*)"[^>]*type="hidden"[^>]*value="([^"]*)"[^>]*>/g,
)) {
  const pair = [decodeEntities(m[1]), decodeEntities(m[2])];
  if (!hidden.some(([n]) => n === pair[0])) hidden.push(pair);
}

if (!hidden.some(([n]) => n.startsWith("$ACTION"))) {
  console.error(
    "The login form has no server-action fields (is the dev server running?).",
  );
  process.exit(1);
}

// 2. POST the credentials exactly as the browser would.
const body = new FormData();
for (const [name, value] of hidden) body.append(name, value);
body.append("email", email);
body.append("password", password);
if (code) body.append("code", code);

const res = await fetch(`${base}/login`, {
  method: "POST",
  redirect: "manual",
  body,
});

const setCookie = res.headers.getSetCookie?.() ?? [];
const session = setCookie
  .map((c) => c.split(";")[0])
  .find((c) => c.startsWith("tms_session="));

if (!session) {
  console.error(
    `Sign-in did not produce a session (status ${res.status}). Check the credentials.`,
  );
  console.error((await res.text()).slice(0, 600));
  process.exit(1);
}

console.log(session);
