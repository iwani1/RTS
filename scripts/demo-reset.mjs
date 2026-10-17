#!/usr/bin/env node
/**
 * Reset the demonstration to a clean state and start it again.
 *
 * A pitch is easier to run on data nobody has scribbled on. This script
 * stops the application, throws away the local database (PGlite keeps it
 * beside the project, in `.data/pgdata`), and starts the server, which
 * recreates the schema and the demonstration data from the seed.
 *
 * The company's real database is never touched: this only removes the local
 * PGlite directory, and it refuses to run when DATABASE_URL is set.
 *
 * Usage: npm run demo:reset
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, process.env.PGLITE_DATA_DIR ?? ".data/pgdata");

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is set, so this is a server that talks to a real database. The reset is refused.",
    );
    process.exit(1);
  }

  console.log("Stopping the application ...");
  await run(process.execPath, [path.join(root, "scripts", "stop.mjs")]);

  if (fs.existsSync(dataDir)) {
    console.log(`Removing ${path.relative(root, dataDir)} ...`);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  // The demonstration harness signs in as any account without a password, so
  // `npm run demo:check` can walk every screen. It stays closed unless the
  // token is presented, and the token is printed below.
  const token = process.env.TEST_SESSION_TOKEN ?? "ci-smoke-token";
  console.log("Starting the application with fresh demonstration data ...");
  console.log(
    `The demonstration harness is open on this machine with the token "${token}" — it signs in as any account, so use it for the pitch only.`,
  );
  const code = await run("npm", ["start"], {
    stdio: "inherit",
    detached: false,
    env: {
      ...process.env,
      TEST_SESSION_ENABLED: "true",
      TEST_SESSION_TOKEN: token,
    },
  });
  process.exit(code);
}

main();
