/**
 * Stop a running copy of this app.
 *
 * The local database is a single-process PGlite directory, and the server
 * binds a fixed port. When a previous run is still alive, the next
 * `npm start` cannot start — and on a workstation that is the single most
 * common failure. This does the stopping for you:
 *
 *   npm run stop          # stop whatever this project left running
 *   npm run stop && npm start
 *
 * It only touches processes that belong to this project: the process
 * recorded in the database lock file, and any listener on the port whose
 * command line or working directory points at this checkout. Anything else
 * on the machine is left alone and reported.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function dataDir() {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (!configured) return path.join(root, ".data", "pgdata");
  return path.isAbsolute(configured) ? configured : path.join(root, configured);
}

const lockFile = `${dataDir()}.lock`;
const port = Number(process.env.PORT?.trim()) || 3000;

/** True when the process id is still alive. */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The process name and command line, best effort. */
function describe(pid) {
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
    if (cmdline) return cmdline;
  } catch {
    // Not Linux, or not readable.
  }
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return "";
  }
}

/** Does this process belong to this checkout? */
function belongsToProject(pid) {
  const info = describe(pid);
  if (!info) return false;
  return info.includes(root) || info.includes("standalone/server.js");
}

/** The pid listening on the port, if the tools are available. */
function listenerOnPort() {
  const attempts = [
    ["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpcu"]],
    ["ss", ["-ltnp", `sport = :${port}`]],
  ];
  for (const [command, args] of attempts) {
    try {
      const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const pid = output.match(/(?:^|\n)pid=(\d+)/)?.[1] ?? output.match(/users:\(\("([^"]+)",pid=(\d+)/)?.[2];
      if (pid) return Number(pid);
    } catch {
      // The tool is not installed, or it refused. Try the next one.
    }
  }
  return null;
}

const targets = new Set();
const notes = [];

// 1. The process recorded in the database lock file.
try {
  const owner = Number.parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
  if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
    targets.add(owner);
    notes.push(`the database lock file names process ${owner}`);
  }
} catch {
  // No lock file, or it is unreadable.
}

// 2. Anything listening on the port.
const listener = listenerOnPort();
if (listener && isAlive(listener)) {
  if (belongsToProject(listener)) {
    targets.add(listener);
    notes.push(`process ${listener} is listening on port ${port}`);
  } else {
    notes.push(`port ${port} is held by another program (process ${listener}) — leaving it alone`);
  }
}

if (targets.size === 0) {
  console.log("[rts] Nothing of this project is running.");
  if (notes.length) for (const note of notes) console.log(`  ${note}`);
  process.exit(0);
}

console.log(`[rts] Stopping ${targets.size} process(es) of this project:`);
for (const pid of targets) console.log(`  ${pid}  ${describe(pid).slice(0, 90)}`);

for (const pid of targets) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // It may have exited on its own.
  }
}

// Give them a moment to close the database cleanly, then insist.
const deadline = Date.now() + 5000;
while (Date.now() < deadline) {
  const alive = [...targets].filter(isAlive);
  if (alive.length === 0) break;
  spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 200)"]);
}

for (const pid of targets) {
  if (isAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
      console.log(`  ${pid}  did not stop, killed it`);
    } catch {
      // It exited between the check and the signal.
    }
  }
}

console.log("");
console.log("[rts] Stopped. Run npm start now.");
