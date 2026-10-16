import { NextResponse } from "next/server";
import { increment, prometheusMetrics } from "@/lib/observability";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Prometheus metrics endpoint.
 *
 * Scraped by Prometheus or read by an operator with `curl`. The data is
 * collected in-process, so it reflects this instance only — which is exactly
 * what a per-instance metric should show.
 *
 * The endpoint is closed to anonymous callers by default: operational
 * metrics describe how the system is running, which is not something to
 * publish. Set `METRICS_PUBLIC=true` to open it, which is only appropriate
 * behind a private network or an authenticating reverse proxy.
 */
export async function GET(request: Request) {
  if (process.env.METRICS_PUBLIC !== "true") {
    const user = await getSessionUser();
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "prometheus";

  if (format === "json") {
    const { metricsSnapshot } = await import("@/lib/observability");
    return NextResponse.json(metricsSnapshot());
  }

  increment("metrics.scrape");
  return new Response(prometheusMetrics(), {
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
