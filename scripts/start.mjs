/**
 * The local entry point for the production server.
 *
 * Next's standalone server binds to `process.env.HOSTNAME`. Bash sets that
 * variable to the machine's own name, so on Linux the server tries to
 * resolve it as a DNS address and exits with `getaddrinfo ENOTFOUND`. The
 * bind address is decided here instead, from a name that cannot collide
 * with the shell's:
 *
 *   npm start                        # every interface (the default)
 *   BIND_HOST=127.0.0.1 npm start    # this machine only
 *   BIND_HOST=my-host.local npm start
 *   PORT=3001 npm start              # a different port
 *
 * A `HOSTNAME` that already looks like an address is still honoured, so the
 * container image and any existing deployment keep working unchanged.
 *
 * The port is also checked before the server starts, because "address
 * already in use" is the single most common way this fails on a developer's
 * machine — usually a previous copy of the app that is still running. The
 * check names the process holding the port and the three ways out.
 */
import { spawn, execFileSync } from "node:child_process";
import net from "node:net";
import { readFileSync, readlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = path.join(root, ".next", "standalone", "server.js");

/** Anything a socket can actually bind to. */
const ADDRESS = /^(localhost|\[[\da-f:.]+\]|\d{1,3}(\.\d{1,3}){3})$/i;

function resolveBindHost() {
  const explicit = process.env.BIND_HOST?.trim();
  if (explicit) return explicit;

  const inherited = process.env.HOSTNAME?.trim();
  if (inherited && ADDRESS.test(inherited)) return inherited;

  // The shell's machine name is not an address. Bind everywhere instead.
  return "0.0.0.0";
}

/** The port the standalone server will try to bind. */
function resolvePort() {
  const explicit = Number(process.env.PORT?.trim());
  return Number.isInteger(explicit) && explicit > 0 && explicit < 65536 ? explicit : 3000;
}

const bindHost = resolveBindHost();
const port = resolvePort();

/**
 * Tell the Server Action CSRF guard which origin the browser is using.
 *
 * Next compares the browser's `Origin` with the host the request arrived on
 * and refuses the action when they differ, unless the origin is on the
 * allowed list. That list is written into the build, so an application
 * started on a port other than the one it was built for would refuse its
 * own mutations the moment a proxy rewrites the `Host` header — the browser
 * says `localhost:3200` and the list only knows `localhost:3000`.
 *
 * The port the server is actually running on is added here, at start-up, so
 * the guard always knows the origin the browser is really using. Nothing
 * else is added: an unknown origin is still refused.
 */
function allowThePortWeRunOn() {
  const file = path.join(
    root,
    ".next",
    "standalone",
    ".next",
    "required-server-files.json",
  );
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return;
  }

  const serverActions = manifest?.config?.experimental?.serverActions;
  if (!serverActions || !Array.isArray(serverActions.allowedOrigins)) return;

  // The list as the build wrote it, without the entries a previous run of
  // this script added for its own port. The two are kept apart in a small
  // note next to the build, so the entries the build put there are never
  // mistaken for the ones this script added.
  const note = path.join(
    root,
    ".next",
    "standalone",
    ".next",
    "rts-allowed-origins.json",
  );
  let remembered = { build: [], added: [] };
  try {
    remembered = { build: [], added: [], ...JSON.parse(readFileSync(note, "utf8")) };
  } catch {
    remembered = { build: [], added: [] };
  }

  const current = serverActions.allowedOrigins;
  const expected = new Set([...remembered.build, ...remembered.added]);
  const untouched =
    remembered.build.length > 0 &&
    current.length === expected.size &&
    current.every((value) => expected.has(value));

  const base = untouched
    ? [...remembered.build]
    : current.filter((value) => !remembered.added.includes(value));

  const additions = [`localhost:${port}`, `127.0.0.1:${port}`];
  for (const entry of (process.env.SERVER_ACTION_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))) {
    additions.push(entry, `${entry}:${port}`);
  }

  const desired = [...new Set([...base, ...additions])];

  try {
    serverActions.allowedOrigins = desired;
    writeFileSync(file, JSON.stringify(manifest));
    writeFileSync(note, JSON.stringify({ build: base, added: additions }));
  } catch {
    // The list stays as it was; the guard is stricter, not looser.
  }

  // The same list is written into the server bundle, and that is the copy the
  // running server reads.
  const bundle = path.join(root, ".next", "standalone", "server.js");
  try {
    const source = readFileSync(bundle, "utf8");
    const patched = source.replace(
      /("allowedOrigins":)\[[^\]]*\]/g,
      `$1${JSON.stringify(desired)}`,
    );
    if (patched !== source) writeFileSync(bundle, patched);
  } catch {
    // The bundle could not be rewritten; the guard is stricter, not looser.
  }

  console.log(
    `[rts] the Server Action origin list now accepts ${additions.join(", ")}`,
  );
}

if (process.env.HOSTNAME && process.env.HOSTNAME !== bindHost) {
  console.log(
    `[rts] HOSTNAME=${process.env.HOSTNAME} is a machine name, not a bind address. Listening on ${bindHost} instead.`,
  );
}

/**
 * Best effort: which process is holding the port? `lsof` is not installed
 * everywhere and `ss` does not always show the process, so this is a
 * convenience — never a reason to fail.
 */
function portOwner(port) {
  const attempts = [
    ["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpcu"]],
    ["ss", ["-ltnp", `sport = :${port}`]],
  ];
  for (const [command, args] of attempts) {
    try {
      const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const pid = output.match(/(?:^|\n)pid=(\d+)/)?.[1] ?? output.match(/users:\(\("([^"]+)",pid=(\d+)/)?.[2];
      const name = output.match(/users:\(\("([^"]+)"/)?.[1];
      if (pid) return { pid, name, ours: isThisApp(pid) };
    } catch {
      // The tool is not installed, or it refused. Try the next one.
    }
  }
  return null;
}

/**
 * Is the process holding the port another copy of this app? On Linux the
 * command line is readable from /proc, which turns "something is in the
 * way" into "your own earlier copy is in the way".
 */
function isThisApp(pid) {
  const mine = `${root}/.next/standalone`;
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    if (cmdline.includes("standalone/server.js") || cmdline.includes(root)) return true;
  } catch {
    // No /proc, or it is not readable.
  }
  try {
    // Next renames the worker process to "next-server", so the command line
    // says nothing. Its working directory still does.
    if (readlinkSync(`/proc/${pid}/cwd`).startsWith(mine)) return true;
  } catch {
    // Not readable on this platform.
  }
  return false;
}

function portIsFree() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (error) => resolve(error.code !== "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, bindHost === "0.0.0.0" ? undefined : bindHost);
  });
}

function reportPortInUse() {
  const owner = portOwner(port);
  console.error("");
  console.error(`[rts] Port ${port} is already in use — the server cannot start.`);
  console.error("");
  if (owner) {
    if (owner.ours) {
      console.error(`  An earlier copy of this app is still running on ${bindHost}:${port} (process ${owner.pid}).`);
    } else {
      const what = owner.name ? ` (${owner.name})` : "";
      console.error(`  Something${what} is already listening on ${bindHost}:${port}, process ${owner.pid}.`);
    }
    console.error("");
    console.error(`    kill ${owner.pid}     # stop it, then run npm start again`);
  } else {
    console.error(`  Something is already listening on ${bindHost}:${port}.`);
    console.error("  Most often this is an earlier copy of this app that did not stop.");
    console.error("");
    console.error(`    ss -ltnp | grep :${port}    # find the process`);
    console.error(`    lsof -i :${port}           # or, if lsof is installed`);
  }
  console.error("");
  console.error(`    PORT=${port + 1} npm start    # or run on a different port`);
  console.error("");
}

allowThePortWeRunOn();

if (!(await portIsFree())) {
  reportPortInUse();
  process.exit(1);
}

const child = spawn(process.execPath, [server], {
  cwd: root,
  stdio: ["ignore", "inherit", "pipe"],
  env: { ...process.env, HOSTNAME: bindHost, PORT: String(port) },
});

// Next writes its own start-up banner to stderr. It is piped so that an
// "address already in use" can be turned into advice instead of a stack
// trace, and everything else is passed straight through.
let stderrTail = "";
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  stderrTail = (stderrTail + text).slice(-4000);
  process.stderr.write(chunk);
  if (text.includes("EADDRINUSE")) {
    console.error("");
    reportPortInUse();
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    // Re-raise the signal so the parent reports the same exit status.
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
