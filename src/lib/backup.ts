/**
 * Database backups.
 *
 * Two implementations, chosen by how the app is running:
 *
 *  - **PostgreSQL** (`DATABASE_URL` set): `pg_dump` is used when the binary
 *    is on the PATH. When it is not, the job reports that honestly instead of
 *    pretending a backup happened.
 *  - **PGlite** (no `DATABASE_URL`): the data directory is copied. PGlite is
 *    single-process, and the application server is the only writer, so the
 *    copy is a consistent snapshot.
 *
 * Backups are written to `BACKUP_DIR` (default `.data/backups`) and pruned
 * to `BACKUP_RETAIN` files (default 14). The job records the outcome in
 * `job_runs`, so an operator can see the last successful backup and when it
 * happened.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { log } from "@/lib/observability";

const run = promisify(execFile);

function backupDir(): string {
  return process.env.BACKUP_DIR ?? path.join(process.cwd(), ".data", "backups");
}

function retainCount(): number {
  const parsed = Number(process.env.BACKUP_RETAIN ?? 14);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 14;
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Remove the oldest backups beyond the retention window. */
async function prune(): Promise<number> {
  const dir = backupDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  const files = entries.filter((name) => name.startsWith("staffride-")).sort();
  const excess = files.length - retainCount();
  if (excess <= 0) return 0;
  for (const file of files.slice(0, excess)) {
    await fs.rm(path.join(dir, file), { force: true });
  }
  return excess;
}

/**
 * Run a backup. Returns a summary that is written into `job_runs`.
 */
export async function runBackup(): Promise<Record<string, unknown>> {
  const dir = backupDir();
  await fs.mkdir(dir, { recursive: true });
  const name = `staffride-${stamp()}`;

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const target = path.join(dir, `${name}.sql`);
    try {
      await run("pg_dump", ["--no-owner", "--no-acl", "-f", target, databaseUrl], {
        timeout: 10 * 60 * 1000,
      });
      const { size } = await fs.stat(target);
      const pruned = await prune();
      log("info", "backup.completed", { target, sizeBytes: size, pruned });
      return { method: "pg_dump", target, sizeBytes: size, pruned };
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      log("error", "backup.failed", { message });
      throw new Error(
        `pg_dump could not run: ${message}. Install the PostgreSQL client tools, or set BACKUP_DIR to a mounted volume and run an external backup job.`,
      );
    }
  }

  // PGlite: copy the data directory.
  const dataDir =
    process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pgdata");
  try {
    await fs.access(path.join(dataDir, "PG_VERSION"));
  } catch {
    throw new Error(
      `No PGlite data directory at ${dataDir}. The local database has not been created yet, so there is nothing to back up.`,
    );
  }
  const target = path.join(dir, `${name}.tar`);
  try {
    await run("tar", ["-cf", target, "-C", path.dirname(dataDir), path.basename(dataDir)], {
      timeout: 10 * 60 * 1000,
    });
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    throw new Error(
      `The archive tool could not run: ${message}. Install tar, or point BACKUP_DIR at a mounted volume and run an external backup job.`,
    );
  }
  const { size } = await fs.stat(target);
  const pruned = await prune();
  log("info", "backup.completed", { target, sizeBytes: size, pruned });
  return { method: "pglite-archive", target, sizeBytes: size, pruned };
}
