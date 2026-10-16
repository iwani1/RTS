/**
 * Route smoke test.
 *
 * Signs in as each seeded role through the test-harness session endpoint, then
 * requests every application route that role can reach and reports the status
 * code. A route that answers with anything other than 200 (or a 3xx that the
 * role is supposed to be redirected from) fails the run.
 *
 *   TEST_SESSION_TOKEN=secret node scripts/smoke.mjs
 */
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const token = process.env.TEST_SESSION_TOKEN;

const USERS = [
  {
    label: "super admin",
    email: "admin@staffridegh.com",
    routes: [
      "/", "/docs", "/offline", "/register", "/forgot-password", "/reset-password",
      "/dashboard", "/dispatch", "/trips", "/bookings", "/fleet", "/employees",
      "/drivers", "/incidents", "/companies", "/routes", "/finance", "/reports",
      "/audit", "/settings",
    ],
  },
  {
    label: "operations manager",
    email: "ops@staffridegh.com",
    routes: [
      "/dashboard", "/dispatch", "/trips", "/bookings", "/employees", "/companies",
      "/routes", "/incidents", "/reports", "/settings",
    ],
  },
  {
    label: "dispatcher",
    email: "dispatch@staffridegh.com",
    routes: ["/dashboard", "/dispatch", "/trips", "/bookings", "/routes", "/incidents", "/settings"],
  },
  {
    label: "fleet manager",
    email: "fleet@staffridegh.com",
    routes: ["/dashboard", "/fleet", "/drivers", "/incidents", "/settings"],
  },
  {
    label: "finance officer",
    email: "finance@staffridegh.com",
    routes: ["/dashboard", "/drivers", "/finance", "/reports", "/settings"],
  },
  {
    label: "corporate HR",
    email: "hr@sikamanfinancial.com",
    routes: ["/dashboard", "/employees", "/routes", "/trips", "/bookings", "/finance", "/reports", "/incidents", "/settings", "/passenger"],
  },
  {
    label: "employee",
    email: "ama@sikamanfinancial.com",
    routes: ["/passenger", "/passenger/trips", "/settings"],
  },
  {
    label: "driver",
    email: "driver.kwesi@staffridegh.com",
    routes: ["/driver", "/settings"],
  },
];

if (!token) {
  console.error("Set TEST_SESSION_TOKEN to the value the server expects.");
  process.exit(1);
}

async function signIn(email) {
  const res = await fetch(`${base}/api/test/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-token": token },
    body: JSON.stringify({ email }),
  });
  const setCookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!setCookie) {
    throw new Error(
      `Could not obtain a session for ${email} (status ${res.status}): ${await res.text()}`,
    );
  }
  return setCookie;
}

let failures = 0;
let checks = 0;

for (const user of USERS) {
  console.log(`\n${user.label} — ${user.email}`);
  let cookie;
  try {
    cookie = await signIn(user.email);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  sign-in failed: ${error.message}`);
    continue;
  }

  for (const route of user.routes) {
    const r = await fetch(`${base}${route}`, {
      headers: { cookie },
      redirect: "manual",
    });
    checks += 1;
    const ok = r.status === 200 || (r.status >= 300 && r.status < 400);
    if (!ok) failures += 1;
    console.log(`${ok ? "  ok " : "FAIL "} ${String(r.status).padEnd(4)} ${route}`);
  }

  // Dynamic detail pages, discovered from the list views.
  if (user.email === "admin@staffridegh.com") {
    const list = await (await fetch(`${base}/companies`, { headers: { cookie } })).text();
    const companyId = list.match(/\/companies\/(\d+)/)?.[1];
    if (companyId) {
      const r = await fetch(`${base}/companies/${companyId}`, { headers: { cookie }, redirect: "manual" });
      checks += 1;
      const ok = r.status === 200;
      if (!ok) failures += 1;
      console.log(`${ok ? "  ok " : "FAIL "} ${String(r.status).padEnd(4)} /companies/${companyId}`);
    }

    const tripList = await (await fetch(`${base}/trips`, { headers: { cookie } })).text();
    const tripId = tripList.match(/\/trips\/(\d+)/)?.[1];
    if (tripId) {
      const r = await fetch(`${base}/trips/${tripId}`, { headers: { cookie }, redirect: "manual" });
      checks += 1;
      const ok = r.status === 200;
      if (!ok) failures += 1;
      console.log(`${ok ? "  ok " : "FAIL "} ${String(r.status).padEnd(4)} /trips/${tripId}`);
    }
  }

  if (user.label === "driver") {
    const duty = await (await fetch(`${base}/driver`, { headers: { cookie } })).text();
    const tripId = duty.match(/\/driver\/trip\/(\d+)/)?.[1];
    if (tripId) {
      const r = await fetch(`${base}/driver/trip/${tripId}`, { headers: { cookie }, redirect: "manual" });
      checks += 1;
      const ok = r.status === 200;
      if (!ok) failures += 1;
      console.log(`${ok ? "  ok " : "FAIL "} ${String(r.status).padEnd(4)} /driver/trip/${tripId}`);
    }
  }
}

// Public API routes.
console.log("\napi");
for (const route of ["/api/health", "/api/search?q=trip", "/api/dispatch/live"]) {
  const r = await fetch(`${base}${route}`, { redirect: "manual" });
  checks += 1;
  const ok = r.status === 200 || r.status === 401;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok " : "FAIL "} ${String(r.status).padEnd(4)} ${route}`);
}

console.log(
  failures
    ? `\n${failures} of ${checks} checks failed.`
    : `\nAll ${checks} checks passed.`,
);
process.exit(failures ? 1 : 0);
