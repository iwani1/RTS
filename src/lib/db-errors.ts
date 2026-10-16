/**
 * Database failure messages.
 *
 * PGlite reports a contended data directory as an internal
 * `adapterFn is not a function`. That tells the reader nothing. The real
 * cause is almost always a second process opening the same directory, and
 * the fix is one command — so the message is rewritten into an instruction.
 *
 * The same explanation is used by the error boundary and by the health
 * probe, so the browser and the terminal say the same thing.
 */

const CONTENTION_MARKERS = [
  "adapterFn is not a function",
  "PGlite is single-process",
  "could not be opened",
  "Aborted()",
  "lock file",
  "already in use",
];

/** True when the error is the local database refusing to open. */
export function isDatabaseContention(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CONTENTION_MARKERS.some((marker) => message.includes(marker));
}

/**
 * The recovery instructions for a contended local database.
 *
 * `dataDir` is the directory the server was trying to open.
 */
export function databaseRecoverySteps(dataDir: string): string {
  return [
    `The local database at ${dataDir} could not be opened.`,
    "",
    "PGlite is single-process, so a second server holding the same data",
    "directory causes this. Stop every other process using it, then reset",
    "the directory and let the app rebuild it:",
    "",
    `    rm -rf ${dataDir}`,
    "",
    "To run two servers at once, give each one its own directory:",
    "",
    "    PGLITE_DATA_DIR=.data/pgdata-dev npm run dev",
  ].join("\n");
}
