/**
 * Next.js server start hook.
 *
 * This runs once when the server boots — not during `next build`. It is the
 * right place to apply migrations and seed the demonstration dataset, so that a
 * cold container is always schema-correct before the first request arrives.
 */
export async function register() {
  // Only the Node.js server runtime can open a database.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrations } = await import("./db");

  // The local database is single-process. If another server is already
  // holding it, this one will fail with an internal error that explains
  // nothing, so the situation is detected and named before it happens.
  await warnIfDatabaseIsHeldElsewhere();

  try {
    await runMigrations();
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    console.error(
      [
        "",
        "[staffride] Database migration failed.",
        `  ${message}`,
        "",
        "  If you are running without DATABASE_URL, the local PGlite data directory",
        "  may be corrupt or locked by another process. PGlite is single-process:",
        "  stop every other process using it, then reset the directory:",
        "",
        "      rm -rf .data/pgdata && npm run dev",
        "",
      ].join("\n"),
    );
    throw error;
  }

  if (process.env.SEED_ON_BOOT !== "false") {
    try {
      const { ensureSeeded } = await import("./lib/seed");
      await ensureSeeded();
    } catch (error) {
      // A seeding failure must not stop the server — the app still runs, it
      // just starts with an empty dataset.
      console.error("[staffride] seed failed:", (error as Error).message);
    }
  }

  // Register the scheduled jobs and start the runner. Importing the module is
  // what registers the jobs; the runner then keeps them ticking.
  try {
    await import("./lib/scheduled-jobs");
    const { startJobRunner, runBootJobs } = await import("./lib/jobs");
    if (process.env.JOBS_ENABLED !== "false") {
      const outcomes = await runBootJobs();
      for (const outcome of outcomes) {
        console.log(
          `[staffride] job ${outcome.name}: ${outcome.status} (${outcome.durationMs}ms)`,
        );
      }
      startJobRunner();
    }
  } catch (error) {
    // The job runner is not a reason to refuse to serve traffic.
    console.error("[staffride] job runner failed to start:", (error as Error).message);
  }
}

/**
 * Warn when another live process already holds the local data directory.
 *
 * Only applies to the PGlite fallback — a PostgreSQL server is designed to
 * have many clients. The lock file is written by the holder and removed when
 * it exits, so a stale file from a killed process is ignored.
 */
async function warnIfDatabaseIsHeldElsewhere(): Promise<void> {
  if (process.env.DATABASE_URL) return;

  const { isLocalFallback } = await import("./db");
  if (!isLocalFallback) return;

  const { databaseLockFile } = await import("./lib/paths");
  const fs = await import("node:fs");

  const lockFile = databaseLockFile();
  let owner: number | null = null;
  try {
    const raw = fs.readFileSync(lockFile, "utf8").trim();
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) owner = parsed;
  } catch {
    owner = null;
  }

  if (owner && owner !== process.pid && isProcessAlive(owner)) {
    console.error(
      [
        "",
        "[staffride] Another process is already using the local database.",
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
    process.once("SIGINT", () => {
      release();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      release();
      process.exit(0);
    });
  } catch {
    // The lock file is a convenience, not a requirement.
  }
}

/** True when a process id still exists. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
