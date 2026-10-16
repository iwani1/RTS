/**
 * Where things live on disk.
 *
 * The application writes to three places that must not move between runs:
 * the PGlite database directory, the backup archive directory, and the log
 * file. All three default to a `.data` folder beside the project.
 *
 * The catch is the standalone server. It changes its working directory to
 * `.next/standalone` when it starts, which would put `.data` inside `.next/`
 * — and a rebuild wipes `.next/`, taking the demonstration database with it.
 * `appRoot()` walks out of the bundle so the data stays where the user put
 * it.
 */
import path from "node:path";

/**
 * The project root — the directory that contains `package.json` and
 * `drizzle/`.
 */
export function appRoot(): string {
  const cwd = process.cwd();
  const marker = `${path.sep}.next${path.sep}standalone`;
  const index = cwd.lastIndexOf(marker);
  if (index > 0) return cwd.slice(0, index);
  return cwd;
}

/**
 * Resolve a path that may be absolute or relative to the project root.
 * An absolute path is always used as given.
 */
export function resolvePath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(appRoot(), value);
}

/** The directory the PGlite database lives in. */
export function pgliteDataDir(): string {
  const configured = process.env.PGLITE_DATA_DIR;
  if (configured) return resolvePath(configured);
  return path.join(appRoot(), ".data", "pgdata");
}

/** The directory backup archives are written to. */
export function backupDir(): string {
  const configured = process.env.BACKUP_DIR;
  if (configured) return resolvePath(configured);
  return path.join(appRoot(), ".data", "backups");
}

/**
 * The file that records which process holds the PGlite data directory.
 *
 * PGlite has no lock file of its own, and a second process opening the same
 * directory fails with an internal error that says nothing about the cause.
 * This file holds the owner's process id, which is enough to say "another
 * server is already running against this database" — and to say it in a way
 * that names the fix.
 */
export function databaseLockFile(): string {
  return `${pgliteDataDir()}.lock`;
}
