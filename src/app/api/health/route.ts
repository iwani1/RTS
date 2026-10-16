import { db } from "@/db";
import { sql } from "drizzle-orm";
import { metricsSnapshot } from "@/lib/observability";

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
    return Response.json(
      { ok: false, database: "unreachable", error: String(error) },
      { status: 500 },
    );
  }
}
