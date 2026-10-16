import { NextResponse, type NextRequest } from "next/server";
import { increment, log, observe, requestId } from "@/lib/observability";

/**
 * Request instrumentation.
 *
 * Every request is timed, counted and logged as one structured JSON line.
 * The counter names are the route shape, not the concrete URL, so
 * `/trips/17` and `/trips/18` share one series and the metric cardinality
 * stays bounded.
 *
 * This is the `proxy` file convention (Next 16's replacement for
 * `middleware.ts`). It runs on the Node.js runtime, which is what makes the
 * counters visible to `/api/metrics` — they live in the same process.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)",
  ],
};

/** Collapse a concrete path into its route shape. */
function routeShape(pathname: string): string {
  return (
    pathname
      .split("/")
      .map((segment) => {
        if (!segment) return "";
        if (/^\d+$/.test(segment)) return ":id";
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
          return ":uuid";
        }
        return segment;
      })
      .join("/") || "/"
  );
}

export function proxy(request: NextRequest) {
  const started = Date.now();
  const id = requestId();
  const shape = routeShape(request.nextUrl.pathname);

  const response = NextResponse.next({
    headers: { "x-request-id": id },
  });

  const durationMs = Date.now() - started;
  increment(`http.${request.method}.${shape}.requests`);
  observe(`http.${request.method}.${shape}`, durationMs);
  log("info", "http.request", {
    requestId: id,
    method: request.method,
    path: request.nextUrl.pathname,
    route: shape,
    durationMs,
  });

  return response;
}
