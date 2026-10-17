#!/usr/bin/env node
/**
 * Can every demo account actually sign in?
 *
 * Posts the real sign-in form for each seeded account and reports what the
 * server answered — "Invalid email or password", "Too many failed
 * attempts", a two-factor prompt, a refused cross-site request, or a
 * session cookie the browser would throw away.
 *
 * It then follows the session the way a browser would, so a sign-in that
 * appears to work but leaves the user on the sign-in page is caught here
 * too.
 *
 *   node scripts/check-logins.mjs
 *   BASE_URL=http://192.168.1.42:3000 node scripts/check-logins.mjs
 */
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.DEMO_PASSWORD ?? "Password123!";

const ACCOUNTS = [
  ["Super Administrator", "admin@staffridegh.com", "246810"],
  ["Operations Manager", "ops@staffridegh.com", ""],
  ["Dispatcher", "dispatch@staffridegh.com", ""],
  ["Fleet Manager", "fleet@staffridegh.com", ""],
  ["Finance Officer", "finance@staffridegh.com", ""],
  ["Corporate HR Administrator", "hr@sikamanfinancial.com", ""],
  ["Employee / Passenger", "ama@sikamanfinancial.com", ""],
  ["Driver", "driver.kwesi@staffridegh.com", ""],
];

/** A friendly answer when the server is not there at all. */
function noServer(error) {
  const cause = error?.cause ?? error;
  const code = cause?.code ?? "";
  console.log("");
  console.log(`  The server is not answering at ${base}`);
  if (code === "ECONNREFUSED") {
    console.log("  (nothing is listening on that address)");
  }
  console.log("");
  console.log("  Start it in another terminal, then run this again:");
  console.log("    npm start");
  console.log("");
  console.log("  If it runs on another port:");
  console.log("    BASE_URL=http://127.0.0.1:3001 node scripts/check-logins.mjs");
  console.log("  If you reach it over the network instead of on this machine:");
  console.log("    BASE_URL=http://<your-lan-ip>:3000 node scripts/check-logins.mjs");
  console.log("  To see what is listening:");
  console.log("    ss -lnt | grep 3000");
  console.log("");
  process.exit(1);
}

/**
 * Would a browser keep this cookie?
 *
 * A `Secure` cookie is only stored on a trusted origin: https, or plain http
 * on localhost. On a network address over plain http the browser drops it,
 * the session is lost and the app sends the user back to the sign-in page.
 */
function cookieProblem(setCookie) {
  if (!setCookie) return "no session cookie was set";
  const secure = /;\s*secure\b/i.test(setCookie);
  if (!secure) return null;
  const url = new URL(base);
  const trusted =
    url.protocol === "https:" ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (trusted) return null;
  return "the session cookie is marked Secure but this address is plain HTTP — the browser drops it";
}

async function attempt(email, code) {
  const body = new URLSearchParams({ email, password });
  if (code) body.set("code", code);

  let res;
  try {
    res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: base,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch (error) {
    noServer(error);
  }

  const location = res.headers.get("location") ?? "";

  if (res.status === 403) {
    return { ok: false, message: "Cross-site request refused (403)" };
  }

  if (location && !location.includes("/login")) {
    const setCookie = res.headers.get("set-cookie") ?? "";
    const problem = cookieProblem(setCookie);
    if (problem) return { ok: false, message: problem };

    // Follow the session the way a browser would.
    const cookie = setCookie.split(";")[0];
    let followed;
    try {
      followed = await fetch(`${base}${location}`, {
        redirect: "manual",
        headers: { cookie },
      });
    } catch (error) {
      noServer(error);
    }
    if (followed.status === 200) {
      return { ok: true, message: `signed in → ${location}` };
    }
    if ((followed.headers.get("location") ?? "").includes("/login")) {
      return {
        ok: false,
        message: "signed in, but the session did not stick — sent back to the sign-in page",
      };
    }
    return { ok: false, message: `signed in, but ${location} answered ${followed.status}` };
  }

  if (location) {
    const url = new URL(location, base);
    const error = url.searchParams.get("error");
    return { ok: false, message: error ?? "sign-in refused" };
  }
  return { ok: false, message: `unexpected status ${res.status}` };
}

console.log("");
console.log(`  sign-in check · ${base}`);
console.log("");

try {
  // The first request after a restart waits for migrations, the seed and the
  // scheduled jobs, so the probe is given room.
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(30000) });
  if (!health.ok) {
    console.log(`  The server answered /api/health with ${health.status}.`);
    console.log("");
  }
} catch (error) {
  noServer(error);
}

let failed = 0;

for (const [role, email, code] of ACCOUNTS) {
  const result = await attempt(email, code);
  if (!result.ok) failed += 1;
  const mark = result.ok ? "ok  " : "FAIL";
  console.log(`  ${mark}  ${role.padEnd(26)} ${email.padEnd(30)} ${result.message}`);
}

console.log("");
if (failed === 0) {
  console.log(`  All ${ACCOUNTS.length} accounts can sign in.`);
  console.log("");
  process.exit(0);
}

console.log(`  ${failed} of ${ACCOUNTS.length} accounts cannot sign in.`);
console.log("");
console.log("  What the message means:");
console.log("    Invalid email or password  → the account is missing from this database,");
console.log("                                  or the password differs. Reset the demo");
console.log("                                  database: stop the server, then");
console.log("                                    rm -rf .data/pgdata && npm start");
console.log("    Too many failed attempts   → five wrong tries. Wait 15 minutes, or");
console.log("                                  sign in as admin and reset the account in");
console.log("                                  Settings & Users.");
console.log("    Two-factor code required   → privileged account. Admin uses 246810.");
console.log("    Cross-site request refused → the browser and the server disagree about");
console.log("                                  the host. Use the same address you signed");
console.log("                                  in from, and do not go through a proxy.");
console.log("    The session did not stick   → the browser dropped the session cookie.");
console.log("                                  Over plain http on a network address, set");
console.log("                                    SESSION_COOKIE_SECURE=false");
console.log("");
process.exit(1);
