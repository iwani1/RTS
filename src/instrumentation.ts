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
}
