/**
 * Observability.
 *
 * A small, dependency-free telemetry layer: structured JSON logs, a request
 * counter, latency percentiles and a Prometheus-compatible text endpoint.
 *
 * This is deliberately not a full tracing stack. It gives an operator the
 * three questions that matter in production — is it up, how fast is it, and
 * what is failing — without adding a vendor, a collector and a bill. The
 * metrics endpoint is scrape-compatible, so Prometheus or Grafana can be
 * pointed at it later without changing the application.
 */
import { randomUUID } from "node:crypto";

type Bucket = {
  count: number;
  totalMs: number;
  min: number;
  max: number;
  values: number[];
};

const globalForMetrics = globalThis as typeof globalThis & {
  __staffrideMetrics?: Map<string, Bucket>;
  __staffrideCounters?: Map<string, number>;
  __staffrideStartedAt?: number;
};

function buckets(): Map<string, Bucket> {
  globalForMetrics.__staffrideMetrics ??= new Map();
  return globalForMetrics.__staffrideMetrics;
}

function counters(): Map<string, number> {
  globalForMetrics.__staffrideCounters ??= new Map();
  return globalForMetrics.__staffrideCounters;
}

if (!globalForMetrics.__staffrideStartedAt) {
  globalForMetrics.__staffrideStartedAt = Date.now();
}

/** Increment a named counter. */
export function increment(name: string, by = 1): void {
  const map = counters();
  map.set(name, (map.get(name) ?? 0) + by);
}

/** Record a duration, in milliseconds, for a named operation. */
export function observe(name: string, durationMs: number): void {
  const map = buckets();
  const bucket = map.get(name) ?? {
    count: 0,
    totalMs: 0,
    min: Number.POSITIVE_INFINITY,
    max: 0,
    values: [],
  };
  bucket.count += 1;
  bucket.totalMs += durationMs;
  bucket.min = Math.min(bucket.min, durationMs);
  bucket.max = Math.max(bucket.max, durationMs);
  // Keep a bounded sample so percentiles stay cheap and memory stays flat.
  bucket.values.push(durationMs);
  if (bucket.values.length > 1000) bucket.values.shift();
  map.set(name, bucket);
}

/** A request id for correlating a request across log lines. */
export function requestId(): string {
  return randomUUID();
}

/**
 * Write a structured log line.
 *
 * JSON rather than prose, because the first consumer of a log line is a
 * machine. `LOG_FORMAT=pretty` switches to a human-readable line for local
 * development.
 */
export function log(
  level: "info" | "warn" | "error" | "debug",
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  if (process.env.LOG_FORMAT === "pretty") {
    const extras = Object.entries(fields)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(" ");
    const line = `${entry.ts} ${level.toUpperCase().padEnd(5)} ${message}${extras ? ` ${extras}` : ""}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Snapshot of every counter and timing bucket. */
export function metricsSnapshot() {
  const timings: Record<
    string,
    { count: number; avgMs: number; minMs: number; maxMs: number; p95Ms: number }
  > = {};
  for (const [name, bucket] of buckets()) {
    const sorted = [...bucket.values].sort((a, b) => a - b);
    const p95 = sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
      : 0;
    timings[name] = {
      count: bucket.count,
      avgMs: Math.round((bucket.totalMs / Math.max(bucket.count, 1)) * 100) / 100,
      minMs: Number.isFinite(bucket.min) ? Math.round(bucket.min * 100) / 100 : 0,
      maxMs: Math.round(bucket.max * 100) / 100,
      p95Ms: Math.round(p95 * 100) / 100,
    };
  }
  return {
    startedAt: new Date(globalForMetrics.__staffrideStartedAt ?? Date.now()).toISOString(),
    uptimeSeconds: Math.round(
      (Date.now() - (globalForMetrics.__staffrideStartedAt ?? Date.now())) / 1000,
    ),
    counters: Object.fromEntries(counters()),
    timings,
  };
}

/** Prometheus text exposition format. */
export function prometheusMetrics(): string {
  const lines: string[] = [];
  const snapshot = metricsSnapshot();
  lines.push("# HELP staffride_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE staffride_uptime_seconds gauge");
  lines.push(`staffride_uptime_seconds ${snapshot.uptimeSeconds}`);

  for (const [name, value] of Object.entries(snapshot.counters)) {
    const safe = name.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`# TYPE staffride_${safe}_total counter`);
    lines.push(`staffride_${safe}_total ${value}`);
  }

  for (const [name, timing] of Object.entries(snapshot.timings)) {
    const safe = name.replace(/[^a-zA-Z0-9_]/g, "_");
    lines.push(`# TYPE staffride_${safe}_duration_ms summary`);
    lines.push(`staffride_${safe}_duration_ms{quantile="0.95"} ${timing.p95Ms}`);
    lines.push(`staffride_${safe}_duration_ms_count ${timing.count}`);
    lines.push(`staffride_${safe}_duration_ms_sum ${Math.round(timing.avgMs * timing.count)}`);
  }

  return `${lines.join("\n")}\n`;
}
