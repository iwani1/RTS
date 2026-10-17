/**
 * The lock on the local PGlite data directory.
 *
 * PGlite has no lock file of its own, and a second process opening the same
 * directory fails with an internal error that says nothing about the cause.
 * This module records the owner's process id, which is enough to say
 * "another server is already running against this database" — and to say it
 * in a way that names the fix.
 *
 * It lives apart from `src/instrumentation.ts` on purpose. The instrumentation
 * hook is compiled for the Edge runtime as well as for Node, and anything it
 * imports statically is analysed for Edge compatibility. This module is
 * imported dynamically, from the Node branch of the hook, so the Edge build
 * never sees it.
 */
import fs from "node:fs";
import { databaseLockFile } from "@/lib/paths";

/** True when a process id still exists. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Warn when another live process already holds the data directory, then take
 * the lock for this process.
 *
 * Only applies to the PGlite fallback — a PostgreSQL server is designed to
 * have many clients. The lock file is written by the holder and removed when
 * it exits, so a stale file from a killed process is ignored.
 */
export function claimDatabaseLock(): void {
  const lockFile = databaseLockFile();
  let owner: number | null = null;
  try {
    const parsed = Number.parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) owner = parsed;
  } catch {
    owner = null;
  }

  if (owner && owner !== process.pid && isProcessAlive(owner)) {
    console.error(
      [
        "",
        "[rts] Another process is already using the local database.",
        `  Process ${owner} holds ${lockFile.replace(/\.lock$/, "")}.`,
        "",
        "  PGlite is single-process, so this server will fail to read it.",
        "  Stop the other server first, or give this one its own directory:",
        "",
        "      PGLITE_DATA_DIR=.data/pgdata-dev npm run dev",
        "",
      ].join("\n"),
    );
    return;
  }

  try {
    fs.writeFileSync(lockFile, String(process.pid));
    const release = () => {
      try {
        if (fs.readFileSync(lockFile, "utf8").trim() === String(process.pid)) {
          fs.unlinkSync(lockFile);
        }
      } catch {
        // The file is already gone, or the directory was removed.
      }
    };
    process.once("exit", release);
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        release();
        process.exit(0);
      });
    }
  } catch {
    // The lock file is a convenience, not a requirement.
  }
}
