import { db } from "@/db";
import { sql } from "drizzle-orm";
import { metricsSnapshot } from "@/lib/observability";
import { databaseRecoverySteps, isDatabaseContention } from "@/lib/db-errors";
import { pgliteDataDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness probe.
 *
 * `ok` is true when the database answers. The response also carries the
 * process uptime so a load balancer can see a restarted instance.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.select({ v: sql<number>`1` });
    return Response.json({
      ok: true,
      database: "connected",
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: metricsSnapshot().uptimeSeconds,
    });
  } catch (error) {
    // A contended local database is the common failure on a workstation, and
    // it has a one-command fix. Say so instead of passing on an internal
    // error that means nothing to the reader.
    const contention = isDatabaseContention(error);
    return Response.json(
      {
        ok: false,
        database: contention ? "locked" : "unreachable",
        error: contention
          ? databaseRecoverySteps(pgliteDataDir())
          : String(error),
      },
      { status: 500 },
    );
  }
}
