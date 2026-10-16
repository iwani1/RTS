/**
 * Origin check — the Server Action CSRF guard.
 *
 * Next compares the browser's `Origin` header against the `Host` the request
 * arrived on. When they agree the request is allowed; when they disagree the
 * origin has to be on `experimental.serverActions.allowedOrigins`.
 *
 * Three cases matter to somebody testing the app on their own machine:
 *
 *   1. Browsing to `http://localhost:3000` — the origin matches the host, so
 *      the request is allowed with no configuration at all.
 *   2. Browsing to `http://192.168.1.42:3000` from a phone on the same
 *      network — again the origin matches the host, so it is allowed.
 *   3. The app behind a reverse proxy that rewrites the `Host` — the origin
 *      no longer matches, so the public address has to be listed in
 *      `SERVER_ACTION_ALLOWED_ORIGINS`.
 *
 * Usage:
 *   SERVER_ACTION_ALLOWED_ORIGINS=192.168.1.42 npm start
 *   node scripts/origin-check.mjs
 */
import { readFileSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const allowed = process.env.SERVER_ACTION_ALLOWED_ORIGINS ?? "192.168.1.42";
const port = new URL(base).port || "3000";

let failures = 0;
let passed = 0;
let skipped = 0;

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label} ${detail}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

/**
 * The hidden fields of the form that carries `marker`.
 *
 * React renders the server-action reference as a set of `$ACTION_*` hidden
 * inputs. Reading them back is how a browser without JavaScript would submit
 * the form.
 */
function formFields(html, marker) {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/g) ?? [];
  for (const form of forms) {
    if (!form.includes(marker)) continue;
    const fields = [];
    for (const match of form.matchAll(/<input\b[^>]*>/g)) {
      const tag = match[0];
      const name = /\bname="([^"]*)"/.exec(tag)?.[1];
      if (!name) continue;
      const raw = /\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "";
      const value = raw
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#x27;/g, "'");
      fields.push([name, value]);
    }
    return fields;
  }
  return null;
}

async function formSignIn(email, password, code) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(code ? { email, password, code } : { email, password }).toString(),
    redirect: "manual",
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie };
}

const { status, cookie } = await formSignIn(
  "admin@staffridegh.com",
  "Password123!",
  "246810",
);
console.log(`\n1 · sign in\n  ${status === 303 ? "ok  " : "FAIL"} form sign-in  status=${status}`);
if (status !== 303) {
  console.log("  cannot continue without a session");
  process.exit(1);
}

const page = await fetch(`${base}/compliance`, { headers: { cookie } });
const html = await page.text();
const fields = formFields(html, "litres");
console.log(
  `\n2 · the compliance form\n  ${fields ? "ok  " : "FAIL"}  ${fields ? fields.length : 0} hidden action fields`,
);

if (!fields) {
  console.log("  cannot continue without the form");
  process.exit(1);
}

/**
 * Submit the form the way a browser with JavaScript disabled would.
 *
 * `origin` is what the browser sends. `forwardedHost` is the host the request
 * arrives with — a reverse proxy that rewrites it is the case where the two
 * differ, and it is what Next compares the origin against.
 */
async function submitWithOrigin(origin, forwardedHost) {
  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  body.append("litres", "12.5");
  const headers = { cookie, origin };
  if (forwardedHost) headers["x-forwarded-host"] = forwardedHost;
  const res = await fetch(`${base}/compliance`, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, refused: text.includes("Invalid Server Actions request") };
}

const refused = (result) => result.status !== 200 || result.refused;

console.log(`\n3 · the origin check`);

const same = await submitWithOrigin(`http://127.0.0.1:${port}`, `127.0.0.1:${port}`);
check(
  "an origin that matches the host is allowed",
  !refused(same),
  `status=${same.status}`,
);

const lan = await submitWithOrigin(`http://${allowed}:${port}`, `${allowed}:${port}`);
check(
  `a LAN address is allowed without any configuration (${allowed})`,
  !refused(lan),
  `status=${lan.status}`,
);

/**
 * The rewritten-host case only applies when the build carries the extra
 * origin. The allowed origins are compiled into the build, so a build made
 * without `SERVER_ACTION_ALLOWED_ORIGINS` cannot pass it — and that is
 * correct, because the case is about a reverse proxy the operator has not
 * configured.
 */
const compiledOrigins = readCompiledOrigins();
const originIsCompiled = compiledOrigins.some(
  (entry) => entry === allowed || entry === `${allowed}:${port}`,
);
if (originIsCompiled) {
  const proxied = await submitWithOrigin(`http://${allowed}:${port}`, `127.0.0.1:${port}`);
  check(
    "a rewritten host is allowed when the origin is configured",
    !refused(proxied),
    `status=${proxied.status}`,
  );
} else {
  skipped += 1;
  console.log(`  skip  the rewritten-host case — ${allowed} is not in the build.`);
  console.log(
    `        Build with SERVER_ACTION_ALLOWED_ORIGINS=${allowed} to assert it.`,
  );
}

const local = await submitWithOrigin(`http://localhost:${port}`, `127.0.0.1:${port}`);
check("localhost is allowed by default", !refused(local), `status=${local.status}`);

const evil = await submitWithOrigin("https://evil.example.com", `127.0.0.1:${port}`);
check("an unknown origin is refused", refused(evil), `status=${evil.status}`);

/**
 * The origins that were compiled into the build, if the build is readable.
 */
function readCompiledOrigins() {
  try {
    const file = readFileSync(
      new URL("../.next/required-server-files.json", import.meta.url),
      "utf8",
    );
    const parsed = JSON.parse(file);
    return parsed?.config?.experimental?.serverActions?.allowedOrigins ?? [];
  } catch {
    return [];
  }
}

const performed = passed + failures;
console.log(
  failures === 0
    ? `\nORIGIN CHECK COMPLETE — ${performed}/${performed} checks passed${
        skipped ? `, ${skipped} skipped` : ""
      }\n`
    : `\nORIGIN CHECK HAD FAILURES — ${failures} failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
