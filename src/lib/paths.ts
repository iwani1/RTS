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
 * The path is therefore stepped back out to the project root.
 *
 * One rule shapes the code below: the only filesystem call the bundler can
 * see is a `path.join` scoped to a subfolder of the project. An unscoped
 * `process.cwd()` makes the tracer pull the whole project into the server
 * bundle, which Next 16.4 refuses to build.
 */
import path from "node:path";

/**
 * The project's `.data` folder.
 *
 * This is the single place the application reads the working directory from.
 * Everything else is derived from it, so the bundler only has to trace one
 * scoped path.
 */
function dataRoot(): string {
  const here = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
  // The standalone server changes directory into its own bundle. Step back
  // out so the data lives beside the project, not inside `.next`.
  const marker = `${path.sep}.next${path.sep}standalone`;
  const index = here.lastIndexOf(marker);
  return index > 0 ? `${here.slice(0, index)}${path.sep}.data` : here;
}

/**
 * The project root — the directory that contains `package.json` and
 * `drizzle/`.
 */
export function appRoot(): string {
  const data = dataRoot();
  return data.slice(0, data.length - `${path.sep}.data`.length);
}

/**
 * Resolve a path that may be absolute or relative to the project root.
 * An absolute path is always used as given.
 */
export function resolvePath(value: string): string {
  return path.isAbsolute(value) ? value : `${appRoot()}${path.sep}${value}`;
}

/** The directory the PGlite database lives in. */
export function pgliteDataDir(): string {
  const configured = process.env.PGLITE_DATA_DIR;
  if (configured) return resolvePath(configured);
  return `${dataRoot()}${path.sep}pgdata`;
}

/** The directory backup archives are written to. */
export function backupDir(): string {
  const configured = process.env.BACKUP_DIR;
  if (configured) return resolvePath(configured);
  return `${dataRoot()}${path.sep}backups`;
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
