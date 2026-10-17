/**
 * Database access layer.
 *
 * Two drivers, one API:
 *   • `DATABASE_URL` set  → PostgreSQL over `pg` (production / shared environments)
 *   • `DATABASE_URL` unset → PGlite, a real PostgreSQL compiled to WASM, running
 *     entirely in-process. Used for local development, CI and demos so the app
 *     boots and seeds without provisioning a database server.
 *
 * Both paths apply the SQL migrations in `./drizzle`, so the schema is identical
 * everywhere and a deploy is a migration run rather than a schema push.
 *
 * IMPORTANT: nothing here touches the database at import time. `next build`
 * imports every route module while collecting page data; a connection or a
 * migration at that moment would make the build depend on a live database and
 * would run migrations against production during a compile. The driver is
 * created lazily on first use and migrations are applied by
 * `src/instrumentation.ts` at server start.
 */
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { pgliteDataDir as resolvePgliteDataDir } from "@/lib/paths";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Locate the SQL migration folder.
 *
 * `process.cwd()` is not reliable: Next's standalone server changes the
 * working directory to the bundle folder, and a container may mount the
 * application anywhere. The candidates are tried in order, and the first one
 * that actually contains the drizzle journal wins.
 */
function resolveMigrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_FOLDER,
    path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle"),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "drizzle"),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "..", "..", "drizzle"),
    path.join(/*turbopackIgnore: true*/ __dirname, "..", "..", "drizzle"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
  }
  // Fall back to the conventional location so the error message names a
  // sensible path rather than an empty string.
  return path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");
}

const globalForDb = globalThis as typeof globalThis & {
  __rtsPool?: Pool;
  __rtsPglite?: PGlite;
  __rtsDb?: Database;
  __rtsMigrated?: Promise<void>;
};

export const isLocalFallback = !process.env.DATABASE_URL;

let pool: Pool | null = null;

/** Resolve the PGlite data directory. Defaults to `.data/pgdata` under the app root. */
function pgliteDataDir(): string {
  // The path helper knows how to step out of the standalone bundle, so a
  // rebuild never takes the demonstration database with it.
  return resolvePgliteDataDir();
}

/**
 * Create the driver on first use. Kept lazy so that importing this module
 * during a production build never opens a database.
 */
function createDatabase(): Database {
  if (isLocalFallback) {
    const dataDir = pgliteDataDir();
    // PGlite's file-backed mode requires the directory to already exist.
    fs.mkdirSync(dataDir, { recursive: true });
    const pglite = globalForDb.__rtsPglite ?? new PGlite(dataDir);
    globalForDb.__rtsPglite = pglite;
    return drizzlePglite(pglite, { schema }) as unknown as Database;
  }

  const created =
    globalForDb.__rtsPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__rtsPool = created;
  }
  pool = created;
  return drizzlePg(created, { schema }) as unknown as Database;
}

function resolveDatabase(): Database {
  if (!globalForDb.__rtsDb) {
    globalForDb.__rtsDb = createDatabase();
  }
  return globalForDb.__rtsDb;
}

/**
 * The database handle. Queries are forwarded to the real driver, which is
 * created on first use.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const real = resolveDatabase() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return prop in (resolveDatabase() as unknown as object);
  },
});

export { pool };

/**
 * Applies pending migrations exactly once per process.
 *
 * Called from `src/instrumentation.ts` at server start — never at import time.
 * Safe to call more than once: the promise is memoised on globalThis so that
 * Next's dev-mode module reloading does not re-apply them.
 */
export async function runMigrations(): Promise<void> {
  if (!globalForDb.__rtsMigrated) {
    globalForDb.__rtsMigrated = (async () => {
      const handle = resolveDatabase();
      const migrationsFolder = resolveMigrationsFolder();
      if (isLocalFallback) {
        await migratePglite(handle as never, { migrationsFolder });
      } else {
        await migratePg(handle as never, { migrationsFolder });
      }
    })();
  }
  await globalForDb.__rtsMigrated;
}

/** True once migrations have been applied in this process. */
export function isMigrated(): boolean {
  return Boolean(globalForDb.__rtsMigrated);
}
