#!/usr/bin/env node
/**
 * Can every demo account actually sign in?
 *
 * Posts the real sign-in form for each seeded account and reports what the
 * server answered — "Invalid email or password", "Too many failed
 * attempts", a two-factor prompt, or a refused cross-site request. That
 * turns "I cannot log in as the other users" into one line per account.
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
  console.log(`    BASE_URL=http://127.0.0.1:3001 node scripts/check-logins.mjs`);
  console.log("  If you reach it over the network instead of on this machine:");
  console.log(`    BASE_URL=http://<your-lan-ip>:3000 node scripts/check-logins.mjs`);
  console.log("  To see what is listening:");
  console.log("    ss -lnt | grep 3000");
  console.log("");
  process.exit(1);
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
    return { ok: true, message: `signed in → ${location}` };
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
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
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
console.log("");
process.exit(1);
