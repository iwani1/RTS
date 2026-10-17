#!/usr/bin/env node
/**
 * The role matrix, read out of the source.
 *
 * `src/lib/rbac.ts` holds the permission matrix and
 * `src/components/shell/nav-config.ts` holds the navigation. This script
 * parses both and prints, for every role, the screens it can reach, the
 * sections it owns and the fine-grained actions it may perform.
 *
 * It needs no database and no running server, so it is the fast way to
 * answer "what does this role get?" while changing the matrix.
 *
 *   node scripts/role-matrix.mjs                  # the full table
 *   node scripts/role-matrix.mjs --role driver    # one role in detail
 *   node scripts/role-matrix.mjs --json           # machine readable
 *   node scripts/role-matrix.mjs --check          # fail if the docs drifted
 *
 * `--check` compares the computed counts with the numbers published in
 * `src/app/docs/page.tsx` (the in-app guide) and `docs/USER-GUIDE.md`
 * (the written guide). It exits 1 when a role can reach a different number
 * of screens than the documentation claims, which is the drift the guide
 * is supposed to be free of.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const RBAC_SRC = join(ROOT, "src/lib/rbac.ts");
const NAV_SRC = join(ROOT, "src/components/shell/nav-config.ts");
const DOCS_PAGE = join(ROOT, "src/app/docs/page.tsx");
const USER_GUIDE = join(ROOT, "docs/USER-GUIDE.md");

/* ------------------------------------------------------------- parsing */

function read(path) {
  return readFileSync(path, "utf8");
}

/** Pull the body of a `export const NAME ... = {` block out of a source file. */
function blockOf(source, name) {
  const start = source.indexOf(`export const ${name}`);
  if (start === -1) throw new Error(`${name} not found`);
  const open = source.indexOf("{", source.indexOf("=", start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`${name} block is not closed`);
}

/** `key: ["a", "b"]` — the section and permission matrices. */
function parseLists(body) {
  const out = {};
  const re = /(["']?)([A-Za-z0-9_.-]+)\1\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const roles = (m[3].match(/["']([a-z_]+)["']/g) ?? []).map((r) =>
      r.replace(/["']/g, ""),
    );
    out[m[2]] = roles;
  }
  return out;
}

/** `role: "Label"` — the human names. */
function parseLabels(body) {
  const out = {};
  const re = /([a-z_]+)\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(body)) !== null) out[m[1]] = m[2];
  return out;
}

/**
 * The navigation. Entries are flat objects of `href` / `label` / `section`,
 * so a small line scanner is both simpler and safer than a full parse.
 */
function parseNav(source) {
  const entries = [];
  let group = null;
  let pending = null;

  for (const raw of source.split("\n")) {
    const line = raw.trim();

    if (line.startsWith("export const STANDALONE_NAV")) {
      group = "Standalone";
      continue;
    }

    const id = line.match(/^id:\s*"([^"]+)",$/);
    if (id) {
      group = id[1];
      continue;
    }

    const href = line.match(/^href:\s*"([^"]+)",$/);
    if (href) {
      pending = { href: href[1], group };
      continue;
    }

    const label = line.match(/^label:\s*"([^"]+)",$/);
    if (label) {
      if (pending) pending.label = label[1];
      continue;
    }

    const section = line.match(/^section:\s*"([^"]+)",$/);
    if (section) {
      if (pending) pending.section = section[1];
      continue;
    }

    if (line === "}," && pending && pending.label && pending.section) {
      entries.push(pending);
      pending = null;
    }
  }

  return entries;
}

/* ------------------------------------------------------------ the model */

const rbacSource = read(RBAC_SRC);
const navSource = read(NAV_SRC);

const ROLE_LABELS = parseLabels(blockOf(rbacSource, "ROLE_LABELS"));
const MATRIX = parseLists(blockOf(rbacSource, "MATRIX"));
const PERMISSIONS = parseLists(blockOf(rbacSource, "PERMISSIONS"));
const NAV = parseNav(navSource);

const ROLES = Object.keys(ROLE_LABELS);

function navFor(role) {
  return NAV.filter((entry) => (MATRIX[entry.section] ?? []).includes(role));
}

function sectionsFor(role) {
  return Object.entries(MATRIX)
    .filter(([, roles]) => roles.includes(role))
    .map(([section]) => section);
}

function permissionsFor(role) {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([permission]) => permission);
}

/* ------------------------------------------------------------- output */

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
};

const model = ROLES.map((role) => ({
  role,
  label: ROLE_LABELS[role],
  nav: navFor(role).map((entry) => ({
    href: entry.href,
    label: entry.label,
    section: entry.section,
    group: entry.group,
  })),
  sections: sectionsFor(role),
  permissions: permissionsFor(role),
}));

if (has("--json")) {
  process.stdout.write(`${JSON.stringify(model, null, 2)}\n`);
  process.exit(0);
}

if (has("--role")) {
  const wanted = value("--role");
  const found = model.find((m) => m.role === wanted);
  if (!found) {
    console.error(`Unknown role "${wanted}". Known roles: ${ROLES.join(", ")}`);
    process.exit(2);
  }
  console.log(`\n${found.label}  (${found.role})`);
  console.log(`${found.nav.length} sidebar entries\n`);
  for (const entry of found.nav) {
    console.log(`  ${entry.label.padEnd(24)} ${entry.href.padEnd(26)} ${entry.section}`);
  }
  console.log(`\nSections (${found.sections.length}): ${found.sections.join(", ")}`);
  console.log(`\nActions (${found.permissions.length}):`);
  for (const permission of found.permissions) console.log(`  - ${permission}`);
  console.log("");
  process.exit(0);
}

/* ----------------------------------------------------------- the table */

console.log("");
console.log("  RTS — WHAT EACH ROLE CAN REACH");
console.log("  ======================================");
console.log("");

for (const entry of model) {
  console.log(`  ${entry.label}  (${entry.role})`);
  console.log(`  ${entry.nav.length} sidebar entries, ${entry.permissions.length} actions`);
  const groups = [];
  for (const item of entry.nav) {
    let group = groups.find((g) => g.name === item.group);
    if (!group) {
      group = { name: item.group, items: [] };
      groups.push(group);
    }
    group.items.push(item.label);
  }
  for (const group of groups) {
    console.log(`    ${group.name.padEnd(12)} ${group.items.join("  ·  ")}`);
  }
  console.log("");
}

/* ---------------------------------------------------------- the check */

if (!has("--check")) process.exit(0);

const problems = [];

/** Number words the guide uses in prose ("Twenty sidebar entries"). */
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
};

const countOf = (entry) => entry.nav.length;

/**
 * A published label matches a role when every word it uses is the start of
 * the role's own word — "Corporate HR Admin" is "Corporate HR
 * Administrator", "Employee / Passenger" is the employee role.
 */
function labelMatches(published, roleLabel) {
  const a = published.split(/\s+/).filter(Boolean);
  const b = roleLabel.split(/\s+/).filter(Boolean);
  if (a.length > b.length) return false;
  return a.every((word, i) => b[i].toLowerCase().startsWith(word.toLowerCase()));
}

/* the in-app guide: "Super Administrator      20 entries   ..." */
const docsPage = read(DOCS_PAGE);
const publishedCounts = [];
const publishedRe = /([A-Z][A-Za-z]*(?:[ \/]+[A-Za-z]+)*?)\s+(\d+)\s+entries/g;
let publishedMatch;
while ((publishedMatch = publishedRe.exec(docsPage)) !== null) {
  publishedCounts.push({ label: publishedMatch[1].trim(), count: Number(publishedMatch[2]) });
}

let docsChecked = 0;

for (const entry of model) {
  const claims = publishedCounts.filter((c) => labelMatches(c.label, entry.label));
  if (claims.length === 0) {
    problems.push(
      `src/app/docs/page.tsx — no published count for ${entry.label}`,
    );
    continue;
  }
  docsChecked += 1;
  const claimed = claims[0].count;
  const actual = countOf(entry);
  if (actual !== claimed) {
    problems.push(
      `src/app/docs/page.tsx — ${entry.label} claims ${claimed} entries, the code gives ${actual}`,
    );
  }
}

/* the written guide: "Landing on **Dashboard**. Twenty sidebar entries." */
const guide = read(USER_GUIDE);
const guideSections = guide.split(/\n(?=### )/);
let guideChecked = 0;

for (const chunk of guideSections) {
  const heading = chunk.match(/^### ([^—\n]+)/);
  if (!heading) continue;
  const published = heading[1].trim();
  const entry = model.find((r) => labelMatches(published, r.label));
  if (!entry) continue;
  const sentence = chunk.match(
    /(?:\*\*)?([A-Za-z]+|[0-9]+)\s+sidebar entries/,
  );
  if (!sentence) continue;
  const token = sentence[1].toLowerCase();
  const claimed = /^\d+$/.test(token) ? Number(token) : WORDS[token];
  if (!claimed) continue;
  guideChecked += 1;
  const actual = countOf(entry);
  if (actual !== claimed) {
    problems.push(
      `docs/USER-GUIDE.md — ${entry.label} claims ${claimed} entries, the code gives ${actual}`,
    );
  }
}

if (guideChecked === 0) {
  problems.push("docs/USER-GUIDE.md — no per-role entry counts found");
}

if (problems.length) {
  console.error("ROLE MATRIX CHECK FAILED");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `ROLE MATRIX CHECK PASSED — ${model.length} roles, ` +
    `${docsChecked} published counts in the app guide, ` +
    `${guideChecked} in docs/USER-GUIDE.md`,
);
console.log("");
