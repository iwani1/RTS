/**
 * A latency check for the read-heavy endpoints.
 *
 * Not a benchmark — a smoke measurement. It reports the median and the 95th
 * percentile of 40 requests per endpoint so a regression in the database
 * layer shows up as a number rather than a feeling.
 *
 *   node scripts/latency.mjs
 */
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const token = process.env.TEST_SESSION_TOKEN ?? "ci-smoke-token";

async function cookie() {
  const res = await fetch(`${base}/api/test/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-token": token },
    body: JSON.stringify({ email: "admin@staffridegh.com" }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

const jar = await cookie();

const targets = [
  ["/dashboard", "GET"],
  ["/dispatch", "GET"],
  ["/trips", "GET"],
  ["/bookings", "GET"],
  ["/fleet", "GET"],
  ["/employees", "GET"],
  ["/routes", "GET"],
  ["/finance", "GET"],
  ["/reports", "GET"],
  ["/audit", "GET"],
  ["/settings", "GET"],
  ["/api/dispatch/live", "GET"],
  ["/api/search?q=kwesi", "GET"],
  ["/api/metrics", "GET"],
];

const RUNS = 40;

console.log(`\nlatency · ${RUNS} requests per endpoint · ${base}\n`);
console.log("endpoint".padEnd(30) + "p50".padStart(9) + "p95".padStart(9) + "max".padStart(9) + "  errors");
console.log("-".repeat(62));

for (const [path, method] of targets) {
  const times = [];
  let errors = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const started = process.hrtime.bigint();
    try {
      const res = await fetch(`${base}${path}`, { headers: { cookie: jar }, redirect: "manual" });
      if (res.status >= 500) errors += 1;
      await res.arrayBuffer();
    } catch {
      errors += 1;
    }
    times.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const max = times[times.length - 1];
  console.log(
    path.padEnd(30) +
      `${p50.toFixed(1)}ms`.padStart(9) +
      `${p95.toFixed(1)}ms`.padStart(9) +
      `${max.toFixed(1)}ms`.padStart(9) +
      `  ${errors}`,
  );
}
console.log();
