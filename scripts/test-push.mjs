/**
 * Test the pushed branch the way a new machine would.
 *
 * The working copy can be green and the push still be wrong — a file that
 * was never committed, a migration that did not make it, a script that only
 * works next to a directory that was not pushed. This script removes all of
 * that doubt: it clones the branch from GitHub into a clean directory,
 * installs the dependencies from the lockfile, builds it, starts it against
 * a fresh database and runs the checks against it.
 *
 *   npm run test:push
 *   npm run test:push -- --keep     # leave the clone in place afterwards
 *
 * Nothing in the working copy is touched.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BRANCH = process.env.PUSH_BRANCH ?? "arena/1ef49b8d-rts";
const REMOTE = process.env.PUSH_REMOTE ?? "https://github.com/iwani1/RTS.git";
const PORT = Number(process.env.PUSH_TEST_PORT ?? 3210);
const TOKEN = "push-check-token";
const keep = process.argv.includes("--keep");

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "rts-push-"));
const clone = path.join(workspace, "RTS");

let failures = 0;
let checks = 0;

function check(label, ok, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? clone,
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

function startServer(env) {
  const child = spawn(process.execPath, [path.join(clone, "scripts", "start.mjs")], {
    cwd: clone,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  child.stdout.on("data", () => undefined);
  child.stderr.on("data", () => undefined);
  return child;
}

async function waitForServer(base) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

let server = null;

try {
  console.log(`\n1 · the branch is cloned from GitHub (${BRANCH})`);
  const cloned = run("git", ["clone", "--branch", BRANCH, "--single-branch", REMOTE, clone], {
    cwd: workspace,
    quiet: true,
  });
  check("the clone succeeded", cloned.status === 0, cloned.stderr?.trim().split("\n").pop() ?? "");
  if (cloned.status !== 0) throw new Error("the clone failed");

  const head = run("git", ["rev-parse", "HEAD"], { quiet: true }).stdout.trim();
  const local = run("git", ["rev-parse", "HEAD"], { cwd: path.resolve(clone, ".."), quiet: true });
  console.log(`     the clone is at ${head.slice(0, 10)}`);

  console.log("\n2 · the dependencies are installed from the lockfile");
  const installed = run("npm", ["ci", "--no-audit", "--no-fund"], { quiet: true });
  check("npm ci succeeded", installed.status === 0, installed.stderr?.trim().split("\n").pop() ?? "");

  console.log("\n3 · the checks in the repository pass");
  const verified = run("npm", ["run", "verify"], { quiet: true });
  check("npm run verify passed", verified.status === 0);
  if (verified.status !== 0) console.log(verified.stdout?.split("\n").slice(-25).join("\n"));

  console.log("\n4 · the application builds");
  const built = run("npm", ["run", "build"], { quiet: true });
  check("npm run build succeeded", built.status === 0, built.stdout?.match(/Error[^\n]*/)?.[0] ?? "");

  console.log("\n5 · it starts against a fresh database");
  server = startServer({
    HOSTNAME: "127.0.0.1",
    PORT: String(PORT),
    PGLITE_DATA_DIR: path.join(workspace, "pgdata"),
    TEST_SESSION_ENABLED: "true",
    TEST_SESSION_TOKEN: TOKEN,
  });
  const base = `http://127.0.0.1:${PORT}`;
  const up = await waitForServer(base);
  check("the server is listening", up);
  if (!up) throw new Error("the server did not start");

  console.log("\n6 · the live checks run against the clone");
  const demo = run("npm", ["run", "demo:check"], {
    quiet: true,
    env: { BASE_URL: base, TEST_SESSION_TOKEN: TOKEN },
  });
  const demoChecks = /(\d+) checks/.exec(demo.stdout ?? "")?.[1] ?? "?";
  check(`the live demonstration passed (${demoChecks} checks)`, demo.status === 0);
  if (demo.status !== 0) console.log(demo.stdout?.split("\n").slice(-20).join("\n"));

  const smoke = run("npm", ["run", "test:smoke"], {
    quiet: true,
    env: { BASE_URL: base, TEST_SESSION_TOKEN: TOKEN },
  });
  const smokeChecks = /All (\d+) checks passed/.exec(smoke.stdout ?? "")?.[1] ?? "?";
  check(`the route smoke test passed (${smokeChecks} checks)`, smoke.status === 0);
  if (smoke.status !== 0) console.log(smoke.stdout?.split("\n").slice(-20).join("\n"));

  const payment = run("npm", ["run", "test:payment-audit"], {
    quiet: true,
    env: { AUDIT_PORT: String(PORT + 1), TEST_SESSION_TOKEN: TOKEN },
  });
  const paymentChecks = /all (\d+) checks passed/.exec(payment.stdout ?? "")?.[1] ?? "?";
  check(`the payment path passed (${paymentChecks} checks)`, payment.status === 0);
  if (payment.status !== 0) console.log(payment.stdout?.split("\n").slice(-20).join("\n"));

  console.log(
    failures === 0
      ? `\nPUSH TEST: the pushed branch is good — all ${checks} checks passed`
      : `\nPUSH TEST: ${failures} of ${checks} checks failed`,
  );
} catch (error) {
  console.error(`\nThe run stopped: ${error.message}`);
  failures += 1;
} finally {
  server?.kill("SIGTERM");
  if (!keep) fs.rmSync(workspace, { recursive: true, force: true });
  else console.log(`\nThe clone was left in ${clone}`);
}

process.exit(failures === 0 ? 0 : 1);
