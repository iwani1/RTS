/**
 * What each role actually sees.
 *
 * Signs in as every seeded account, scrapes the navigation the server
 * rendered, and prints it. The guide is written from this output rather
 * than from the permission matrix, so it cannot drift from the application.
 *
 *   node scripts/what-each-role-sees.mjs
 */
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const token = process.env.TEST_SESSION_TOKEN ?? "ci-smoke-token";

const ACCOUNTS = [
  ["admin@staffridegh.com", "Super Administrator"],
  ["ops@staffridegh.com", "Operations Manager"],
  ["dispatch@staffridegh.com", "Dispatcher"],
  ["fleet@staffridegh.com", "Fleet Manager"],
  ["finance@staffridegh.com", "Finance Officer"],
  ["hr@sikamanfinancial.com", "Corporate HR Administrator"],
  ["ama@sikamanfinancial.com", "Employee / Passenger"],
  ["driver.kwesi@staffridegh.com", "Driver"],
];

async function session(email) {
  const res = await fetch(`${base}/api/test/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-token": token },
    body: JSON.stringify({ email }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

/**
 * The navigation the server rendered for this session.
 *
 * The sidebar is the only `<nav>` on the page, so the links inside it are
 * exactly what this role was given.
 */
function navLinks(html) {
  // The page carries two <nav> elements: the breadcrumb and the sidebar.
  // The sidebar is the one that scrolls, and the one with the sections.
  const blocks = [...html.matchAll(/<nav\b[\s\S]*?<\/nav>/g)].map((m) => m[0]);
  const nav = blocks.find((b) => b.includes("overflow-y-auto")) ?? blocks[blocks.length - 1];
  if (!nav) return [];
  const seen = new Set();
  const out = [];
  for (const m of nav.matchAll(/href="(\/[a-z0-9\/-]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!label || seen.has(href)) continue;
    if (href === "/" || href.startsWith("/_next")) continue;
    seen.add(href);
    out.push([href, label]);
  }
  return out;
}

console.log(`\nwhat each role sees · ${base}\n`);

for (const [email, role] of ACCOUNTS) {
  const cookie = await session(email);
  const home = email.startsWith("ama@")
    ? "/passenger"
    : email.startsWith("driver.")
      ? "/driver"
      : "/dashboard";
  const res = await fetch(`${base}${home}`, { headers: { cookie } });
  const html = await res.text();
  const links = navLinks(html);
  console.log(`${role}  (${email})`);
  console.log(`  lands on ${home}  →  ${res.status}`);
  const per = links.map(([href, label]) => `${label} (${href})`);
  console.log(`  sees ${per.length}: ${per.join(" · ")}`);
  console.log();
}
