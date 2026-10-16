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
 *
 * A `HOSTNAME` that already looks like an address is still honoured, so the
 * container image and any existing deployment keep working unchanged.
 */
import { spawn } from "node:child_process";
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

const bindHost = resolveBindHost();
if (process.env.HOSTNAME && process.env.HOSTNAME !== bindHost) {
  console.log(
    `[staffride] HOSTNAME=${process.env.HOSTNAME} is a machine name, not a bind address. Listening on ${bindHost} instead.`,
  );
}

const child = spawn(process.execPath, [server], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: bindHost },
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
