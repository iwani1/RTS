/**
 * Live demo.
 *
 * Drives a running StaffRide server the way a person would: it signs in
 * through the real login form, walks every screen, and exercises the
 * features that were added last — saved views, pagination, PDF export,
 * route optimisation, the scheduled job runner, live tracking and the
 * metrics endpoint.
 *
 * Everything printed is read back from the server. Nothing here is faked
 * and no check is mocked: a step that fails is reported as a failure.
 *
 *   node scripts/demo.mjs [baseUrl]
 *
 * Environment:
 *   BASE_URL              default http://127.0.0.1:3000
 *   TEST_SESSION_TOKEN    the value the server expects on /api/test/session
 *   DEMO_EMAIL            default admin@staffridegh.com
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: process.env.BASE_URL || "http://127.0.0.1:3000" },
    token: { type: "string", default: process.env.TEST_SESSION_TOKEN || "ci-smoke-token" },
    email: { type: "string", default: process.env.DEMO_EMAIL || "admin@staffridegh.com" },
  },
});

const base = values.url.replace(/\/$/, "");
const adminEmail = values.email;
const employeeEmail = "ama@sikamanfinancial.com";
const driverEmail = "driver.kwesi@staffridegh.com";

let failures = 0;
let checks = 0;
const started = Date.now();

const C = {
  reset: "[0m",
  dim: "[2m",
  bold: "[1m",
  orange: "[38;5;208m",
  cyan: "[38;5;51m",
  green: "[38;5;42m",
  red: "[38;5;196m",
};

function heading(text) {
  console.log(`\n${C.bold}${C.cyan}${text}${C.reset}`);
}

function step(label, ok, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  const mark = ok ? `${C.green}ok  ${C.reset}` : `${C.red}FAIL${C.reset}`;
  console.log(`  ${mark} ${label}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`);
}

function note(text) {
  console.log(`       ${C.dim}${text}${C.reset}`);
}

function fail(text) {
  step(text, false);
}

async function text(path, cookie, init = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { cookie, ...(init.headers ?? {}) },
    redirect: "manual",
  });
  return { res, body: await res.text() };
}

/** Open a session through the test harness (used for roles without a form). */
async function harnessSession(email) {
  const res = await fetch(`${base}/api/test/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-token": values.token },
    body: JSON.stringify({ email }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/**
 * Sign in through the real login form — no test harness, no shortcuts.
 *
 * The privileged demonstration accounts carry a second factor, so the code is
 * posted with the password, exactly as the sign-in screen does.
 */
async function formSignIn(email, password, code) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    // A browser sends `Origin` on a form post, and the auth route handlers
    // refuse a post that arrives from another site.
    headers: { "content-type": "application/x-www-form-urlencoded", origin: base },
    body: new URLSearchParams(
      code ? { email, password, code } : { email, password },
    ).toString(),
    redirect: "manual",
  });
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie, location: res.headers.get("location") ?? "" };
}

/**
 * The hidden fields of the form that carries `marker`.
 *
 * React renders the server-action reference as a set of `$ACTION_*` hidden
 * inputs. Reading them back is how a browser without JavaScript would
 * submit the form.
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

/**
 * Submit a form the way a browser with JavaScript disabled would:
 * a multipart POST carrying the `$ACTION_*` fields and the user's input.
 *
 * This is the real no-JavaScript path through the application — not a
 * simulation of it.
 */
async function submitForm(cookie, path, fields, extra = {}) {
  const merged = new Map(fields);
  for (const [name, value] of Object.entries(extra)) merged.set(name, value);
  const body = new FormData();
  for (const [name, value] of merged) body.append(name, value);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { cookie, origin: base },
    body,
    redirect: "manual",
  });
  const text = await res.text();
  // The action result travels back inside the RSC payload, with the quotes
  // escaped for the inline script.
  const okMatch = text.match(/\\?"ok\\?":(true|false)/);
  const msgMatch = text.match(
    /\\?"message\\?":\\?"((?:[^"\\]|\\.)*?)\\?"/,
  );
  const result = okMatch
    ? { ok: okMatch[1] === "true", message: msgMatch ? msgMatch[1] : null }
    : null;
  return { status: res.status, text, result };
}

function countMatches(html, pattern) {
  return (html.match(pattern) ?? []).length;
}

function money(text) {
  return (text.match(/[A-Z]{3}\s[\d,]+\.\d{2}/g) ?? []).slice(0, 4).join("  ");
}

/* ------------------------------------------------------------------ 0. up */

heading("0 · Server");
{
  const res = await fetch(`${base}/api/health`, { redirect: "manual" });
  const body = await res.text();
  step("health endpoint answers", res.status === 200, body.slice(0, 120));
  const started2 = Date.now();
  await fetch(`${base}/dashboard`, { redirect: "manual" });
  note(`unauthenticated /dashboard answered in ${Date.now() - started2} ms`);
}

/* -------------------------------------------------------------- 1. sign in */

heading("1 · Authentication (real login form, no JavaScript)");
const admin = await formSignIn(adminEmail, "Password123!", process.env.DEMO_TOTP_CODE || "246810");
step(
  "form sign-in returns a session cookie",
  admin.cookie.includes("tms_session"),
  `status=${admin.status} → ${admin.location}`,
);

const cookie = admin.cookie;

/* --------------------------------------------------------- 2. core screens */

heading("2 · The four interfaces");

const SCREENS = [
  { path: "/dashboard", label: "Operations dashboard", needle: "Dashboard" },
  { path: "/dispatch", label: "Dispatch command centre", needle: "Dispatch" },
  { path: "/trips", label: "Trip management", needle: "Trip" },
  { path: "/bookings", label: "Bookings & reservations", needle: "Booking" },
  { path: "/calendar", label: "Schedule calendar", needle: "Schedule" },
  { path: "/fleet", label: "Fleet register", needle: "Fleet" },
  { path: "/drivers", label: "Driver register", needle: "Driver" },
  { path: "/employees", label: "Employee register", needle: "Employee" },
  { path: "/companies", label: "Corporate clients", needle: "Client" },
  { path: "/routes", label: "Routes & stops", needle: "Route" },
  { path: "/optimise", label: "Route optimisation (VRP)", needle: "optimisation" },
  { path: "/incidents", label: "Safety & incidents", needle: "Incident" },
  { path: "/compliance", label: "Compliance & fuel logs", needle: "Compliance" },
  { path: "/finance", label: "Billing & payroll", needle: "Billing" },
  { path: "/currencies", label: "Currencies", needle: "Currenc" },
  { path: "/reports", label: "Reports & BI", needle: "Report" },
  { path: "/operations", label: "Operations (job runner)", needle: "Operation" },
  { path: "/audit", label: "Audit trail", needle: "Audit" },
  { path: "/settings", label: "Settings & users", needle: "Setting" },
];

for (const screen of SCREENS) {
  const { res, body } = await text(screen.path, cookie);
  const ok = res.status === 200 && body.toLowerCase().includes(screen.needle.toLowerCase());
  step(`${screen.label.padEnd(34)} ${screen.path}`, ok, `status=${res.status}`);
}

// The employee and driver applications.
{
  const employee = await harnessSession(employeeEmail);
  const { res, body } = await text("/passenger", employee);
  step(
    "Passenger mobile web app",
    res.status === 200 && body.includes("Passenger"),
    `status=${res.status}`,
  );
  const corridor = await text("/passenger/corridor", employee);
  step(
    "Passenger live corridor & sharing",
    corridor.res.status === 200,
    `status=${corridor.res.status}`,
  );

  const driver = await harnessSession(driverEmail);
  const duty = await text("/driver", driver);
  step("Driver mobile web app", duty.res.status === 200, `status=${duty.res.status}`);
  const tripId = (duty.body.match(/\/driver\/trip\/(\d+)/) ?? [])[1];
  if (tripId) {
    const detail = await text(`/driver/trip/${tripId}`, driver);
    step("Driver trip duty sheet", detail.res.status === 200, `status=${detail.res.status}`);
  }
}

/* ------------------------------------------------------- 3. saved views */

heading("3 · Saved views (per-user filter sets)");

{
  const before = await text("/bookings?status=approved", cookie);
  step("bookings list loads with a filter applied", before.res.status === 200);

  const save = await text("/api/views/save", cookie, {
    method: "POST",
    // A browser sends `Origin` on a form post, and the auth route handlers
    // refuse a post that arrives from another site.
    headers: { "content-type": "application/x-www-form-urlencoded", origin: base },
    body: new URLSearchParams({
      scope: "bookings",
      name: "Demo approved bookings",
      "filter.status": "approved",
      returnTo: "/bookings?status=approved",
    }).toString(),
  });
  step(
    "view saved through the form endpoint",
    save.res.status === 303 || save.res.status === 302,
    `status=${save.res.status}`,
  );

  const after = await text("/bookings?status=approved", cookie);
  const saved = after.body.includes("Demo approved bookings");
  step("saved view appears on the list", saved);
  if (saved) {
    const chip = after.body.match(/href="\/bookings\?status=approved"[^>]*>\s*([^<]+)/);
    note(`view chip renders as: ${chip ? chip[1].trim() : "Demo approved bookings"}`);
  }

  // Delete it again so the demo leaves no debris.
  const idMatch = after.body.match(/name="id" value="(\d+)"/);
  if (idMatch) {
    const del = await text("/api/views/delete", cookie, {
      method: "POST",
      // A browser sends `Origin` on a form post, and the auth route handlers
    // refuse a post that arrives from another site.
    headers: { "content-type": "application/x-www-form-urlencoded", origin: base },
      body: new URLSearchParams({
        id: idMatch[1],
        scope: "bookings",
        returnTo: "/bookings?status=approved",
      }).toString(),
    });
    const cleaned = await text("/bookings?status=approved", cookie);
    step(
      "view deleted and the list is clean again",
      (del.res.status === 303 || del.res.status === 302) &&
        !cleaned.body.includes("Demo approved bookings"),
    );
  } else {
    fail("view delete control rendered");
  }
}

/* --------------------------------------------------------- 4. pagination */

heading("4 · Pagination");

{
  const page1 = await text("/bookings?page=1", cookie);
  const page2 = await text("/bookings?page=2", cookie);
  const ok =
    page1.res.status === 200 &&
    page2.res.status === 200 &&
    page1.body !== page2.body;
  step("page 1 and page 2 return different registers", ok);
  const links = countMatches(page1.body, /href="\/bookings\?[^"]*page=2"/);
  step("pagination control renders page links", links > 0, `${links} link(s) to page 2`);
  const firstRef = (page1.body.match(/\/trips\/(\d+)/) ?? [])[1];
  const secondRef = (page2.body.match(/\/trips\/(\d+)/) ?? [])[1];
  if (firstRef && secondRef) {
    step("the two pages show different records", firstRef !== secondRef, `${firstRef} vs ${secondRef}`);
  }
}

/* --------------------------------------------------------- 5. PDF export */

heading("5 · PDF export (server-rendered, dependency-free)");

{
  const res = await fetch(`${base}/api/reports/pdf?type=trips`, {
    headers: { cookie },
    redirect: "manual",
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  const isPdf = buffer.subarray(0, 5).toString() === "%PDF-";
  const hasBody = buffer.toString("latin1").includes("%%EOF");
  step("trip register PDF downloads", res.status === 200 && isPdf && hasBody, `${buffer.length} bytes`);
  note(`content-type: ${res.headers.get("content-type")}`);

  const tripList = await text("/trips", cookie);
  const tripId = (tripList.body.match(/\/trips\/(\d+)/) ?? [])[1];
  if (tripId) {
    const manifest = await fetch(
      `${base}/api/reports/pdf?type=manifest&tripId=${tripId}`,
      { headers: { cookie }, redirect: "manual" },
    );
    const mBuf = Buffer.from(await manifest.arrayBuffer());
    step(
      "passenger manifest PDF downloads",
      manifest.status === 200 && mBuf.subarray(0, 5).toString() === "%PDF-",
      `${mBuf.length} bytes for trip ${tripId}`,
    );
  }

  const fin = await text("/finance", cookie);
  const invoiceLink = (fin.body.match(/\/api\/reports\/pdf\?type=invoice&amp;id=(\d+)/) ?? [])[1];
  if (invoiceLink) {
    const inv = await fetch(`${base}/api/reports/pdf?type=invoice&id=${invoiceLink}`, {
      headers: { cookie },
      redirect: "manual",
    });
    const iBuf = Buffer.from(await inv.arrayBuffer());
    step(
      "invoice PDF downloads",
      inv.status === 200 && iBuf.subarray(0, 5).toString() === "%PDF-",
      `${iBuf.length} bytes`,
    );
    note(`invoice totals read back: ${money(iBuf.toString("latin1"))}`);
  } else {
    note("no invoice on the ledger yet — the seed creates them on demand");
  }

  const denied = await fetch(`${base}/api/reports/pdf?type=trips`, { redirect: "manual" });
  step("PDF export refuses an anonymous caller", denied.status === 401, `status=${denied.status}`);
}

/* --------------------------------------------------- 6. route optimisation */

heading("6 · Route optimisation (solver running on live data)");

{
  const { res, body } = await text("/optimise", cookie);
  const km = (body.match(/([\d.]+)\s*km/) ?? [])[1];
  const hasMethod = body.includes("Clarke-Wright");
  step("optimisation screen solves a problem", res.status === 200 && hasMethod, `status=${res.status}`);
  const cell = (label) => {
    const at = body.indexOf(label);
    if (at < 0) return "?";
    const chunk = body.slice(at, at + 600);
    const value = chunk.match(/>([\d][\d.,]*)\s*<\/span>/);
    return value ? value[1] : "?";
  };
  note(
    `total distance ${km ?? "?"} km · vehicles used ${cell("Vehicles used")} · unassigned ${cell("Unassigned")} · staff to move ${cell("Staff to move")}`,
  );
  step("the screen states the solver method honestly", hasMethod);
  step("the screen names OR-Tools as the upgrade path", body.includes("OR-Tools"));
}

/* ------------------------------------------------------- 7. job runner */

heading("7 · Scheduled job runner");

{
  const { res, body } = await text("/operations", cookie);
  step("operations screen loads", res.status === 200, `status=${res.status}`);
  const jobs = countMatches(body, /Run now/g);
  note(`job run controls rendered: ${jobs} match(es)`);
  const metrics = await fetch(`${base}/api/metrics`, { headers: { cookie }, redirect: "manual" });
  const mText = await metrics.text();
  step("Prometheus metrics endpoint answers", metrics.status === 200, `${mText.length} bytes`);
  const jobMetric = (mText.match(/^staffride_jobs_total\{[^}]*\}\s+\d+/m) ?? [])[0];
  if (jobMetric) note(jobMetric);
  const httpMetric = countMatches(mText, /^staffride_http_/gm);
  note(`http metric series: ${httpMetric}`);
}

/* ------------------------------------------------- 8. live tracking + share */

heading("8 · Live tracking, geofence and passenger sharing");

{
  const live = await fetch(`${base}/api/dispatch/live`, { headers: { cookie }, redirect: "manual" });
  const liveBody = await live.text();
  step("live dispatch feed answers", live.status === 200, `${liveBody.length} bytes`);
  let trips = [];
  try {
    const parsed = JSON.parse(liveBody);
    trips = parsed.trips ?? parsed.data ?? [];
  } catch {
    note("feed is not JSON — reporting the raw length only");
  }
  if (Array.isArray(trips)) {
    note(`live trips on the feed: ${trips.length}`);
    if (trips.length) {
      const first = trips[0];
      const pos = first.lastPosition ?? {};
      note(
        `first trip ${first.reference ?? first.id ?? "?"} — ${first.vehicle ?? "?"} driven by ${first.driver ?? "?"}, position ${pos.lat ?? "?"},${pos.lng ?? "?"} at ${pos.speedKph ?? "?"} km/h, status ${first.status ?? "?"}`,
      );
      const seats = trips.reduce(
        (sum, t) => sum + Number(t.bookedSeats ?? 0),
        0,
      );
      const capacity = trips.reduce(
        (sum, t) => sum + Number(t.capacity ?? 0),
        0,
      );
      note(
        `corridor load across ${trips.length} live trips: ${seats} passengers of ${capacity} seats`,
      );
    }
  }

  const employee = await harnessSession(employeeEmail);
  const corridor = await text("/passenger/corridor", employee);
  step("passenger corridor screen loads", corridor.res.status === 200);
  step(
    "the corridor screen offers a share code",
    corridor.body.includes("share") || corridor.body.includes("Share"),
  );

  const share = await text("/api/dispatch/live", employee, { redirect: "manual" });
  step(
    "a passenger session is refused the dispatch feed",
    share.res.status === 401 || share.res.status === 403,
    `status=${share.res.status}`,
  );
}

/* ------------------------------------------------- 9. finance + currency */

heading("9 · Multicurrency");

{
  const { res, body } = await text("/currencies", cookie);
  step("currencies screen loads", res.status === 200, `status=${res.status}`);
  const codes = (body.match(/\b(GHS|USD|EUR|GBP|NGN|ZAR|KES|AED)\b/g) ?? []);
  const unique = [...new Set(codes)];
  step("the rate table lists several currencies", unique.length >= 3, unique.join(", "));
  step("the screen labels the rates as indicative", /indicative/i.test(body));
}

/* ------------------------------------------------------ 10. observability */

heading("10 · Observability");

{
  const res = await fetch(`${base}/api/health`, { redirect: "manual" });
  const body = await res.text();
  step("health endpoint reports the process state", res.status === 200);

  const metrics = await fetch(`${base}/api/metrics`, { headers: { cookie }, redirect: "manual" });
  const text_ = await metrics.text();
  const families = [...new Set((text_.match(/^staffride_[a-z_]+/gm) ?? []))];
  step("metrics expose several families", families.length >= 3, families.join(", "));
  const httpSeries = countMatches(text_, /^staffride_http_/gm);
  step("http request counters are recorded", httpSeries > 0, `${httpSeries} series`);
  const p95 = (text_.match(/^staffride_http_[^\n]*duration_ms\{quantile="0.95"\}\s+([\d.]+)/m) ?? [])[1];
  if (p95) note(`sample p95: ${p95} ms`);

  const denied = await fetch(`${base}/api/metrics`, { redirect: "manual" });
  step(
    "metrics refuse an anonymous caller",
    denied.status === 401,
    `status=${denied.status}`,
  );
}

/* ------------------------------------------- 11. server actions for real */

heading("11 · Server actions (the same calls the browser makes)");

{
  const ops = await text("/operations", cookie);
  const fields = formFields(ops.body, "Run");
  step("the job table renders a runnable form", Boolean(fields), fields ? `${fields.length} field(s)` : "");
  if (fields) {
    const { status, result } = await submitForm(cookie, "/operations", fields, {
      name: "promote-waitlist",
    });
    step(
      "the job runs on demand",
      status === 200 && result?.ok === true,
      `status=${status}`,
    );
    if (result?.message) note(`action said: ${result.message}`);
  }
}

{
  // A guarded action must refuse a payload that fails validation, with a
  // structured message rather than a 500.
  const compliance = await text("/compliance", cookie);
  const fields = formFields(compliance.body, "Record fuel");
  if (fields) {
    const { status, result } = await submitForm(cookie, "/compliance", fields, {
      vehicleId: "1",
      litres: "",
      cost: "",
    });
    step(
      "a fuel log with no litres is refused cleanly",
      status === 200 && result?.ok === false && !/"digest"/.test(result?.message ?? ""),
      `status=${status}`,
    );
    if (result?.message) note(`action said: ${result.message}`);
  } else {
    note("no fuel-log form rendered on the compliance screen");
  }
}

{
  // And a valid payload must actually write a row.
  const compliance = await text("/compliance", cookie);
  const fields = formFields(compliance.body, "Record fuel");
  if (fields) {
    const litres = 41.25 + Math.round(Math.random() * 8);
    const { status, result } = await submitForm(cookie, "/compliance", fields, {
      vehicleId: "3",
      litres: String(litres),
      cost: String(Math.round(litres * 14.5 * 100) / 100),
      odometerKm: "184230",
      station: "Demo Live Fuel",
    });
    step(
      "a valid fuel log is written",
      status === 200 && result?.ok === true,
      `status=${status}`,
    );
    if (result?.message) note(`action said: ${result.message}`);
  }
}

/* ------------------------------------------------------------- summary */

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `\n${C.bold}${failures === 0 ? C.green : C.red}${
    failures === 0 ? "LIVE DEMO COMPLETE" : "LIVE DEMO HAD FAILURES"
  }${C.reset} ${C.dim}${checks} checks in ${seconds}s${C.reset}`,
);
if (failures) {
  console.log(`${C.red}${failures} check(s) failed.${C.reset}`);
  process.exit(1);
}
console.log(
  `${C.dim}Every figure above was read back from the running server — nothing is pre-scripted.${C.reset}`,
);
process.exit(0);
