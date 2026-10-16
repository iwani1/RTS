import { desc } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { InlineActionForm } from "@/components/action-form";
import {
  EmptyState,
  MetricStrip,
  MetricCell,
  PageHeader,
  Panel,
  StatusChip,
  TableWrap,
  TBody,
  TD,
  TDPrimary,
  THead,
  TH,
  TR,
} from "@/components/ui";
import { runJobAction } from "@/app/actions/platform";
import { requireSection } from "@/lib/auth";
import { recentJobRuns, registeredJobs } from "@/lib/jobs";
// Importing the module is what registers the jobs. The operations screen
// needs the registry even if the instrumentation hook has not run.
import "@/lib/scheduled-jobs";
import { metricsSnapshot } from "@/lib/observability";
import { dateOnly, humanize, n, timeOnly } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Operations.
 *
 * The scheduled work, what it did last, and how the process itself is
 * behaving. An operator opens this page to answer "is the automation running,
 * and is it healthy?" without opening a log file.
 */
export default async function OperationsPage() {
  await requireSection("operations");

  const [runs, definitions, metrics] = await Promise.all([
    recentJobRuns(30),
    Promise.resolve(registeredJobs()),
    Promise.resolve(metricsSnapshot()),
  ]);

  const succeeded = runs.filter((run) => run.status === "succeeded").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  const lastBackup = runs.find((run) => run.jobName === "backup-database");

  const timings = Object.entries(metrics.timings);
  const slowest = timings.sort((a, b) => b[1].p95Ms - a[1].p95Ms).slice(0, 6);
  const counters = Object.entries(metrics.counters).slice(0, 10);

  return (
    <div>
      <PageHeader
        eyebrow="Govern"
        title="Operations"
        subtitle="The scheduled work, its run history, and the health of the process."
      />

      <MetricStrip className="mt-4">
        <MetricCell label="Registered jobs" value={String(definitions.length)} />
        <MetricCell label="Runs recorded" value={String(runs.length)} />
        <MetricCell label="Succeeded" value={String(succeeded)} />
        <MetricCell
          label="Failed"
          value={String(failed)}
          tone={failed ? "critical" : undefined}
        />
        <MetricCell label="Uptime" value={`${Math.floor(metrics.uptimeSeconds / 60)} min`} />
        <MetricCell
          label="Last backup"
          value={lastBackup ? dateOnly(lastBackup.startedAt) : "Never"}
          hint={lastBackup ? humanize(lastBackup.status) : undefined}
        />
      </MetricStrip>

      <Panel
        className="mt-4"
        eyebrow="Automation"
        title="Scheduled jobs"
        subtitle="Each job records its own run history. Run one now to see what it does."
        padded={false}
      >
        <TableWrap>
          <THead>
            <TR>
              <TH>Job</TH>
              <TH>What it does</TH>
              <TH>Every</TH>
              <TH>Last run</TH>
              <TH>Status</TH>
              <TH>Run now</TH>
            </TR>
          </THead>
          <TBody>
            {definitions.map((job) => {
              const last = runs.find((run) => run.jobName === job.name);
              return (
                <TR key={job.name}>
                  <TDPrimary>
                    <span className="numeric text-[12px]">{job.name}</span>
                  </TDPrimary>
                  <TD>{job.description}</TD>
                  <TD>
                    {job.everyMinutes >= 1440
                      ? `${Math.round(job.everyMinutes / 1440)} day(s)`
                      : `${job.everyMinutes} min`}
                  </TD>
                  <TD>{last ? dateOnly(last.startedAt) : "Never"}</TD>
                  <TD>{last ? <StatusChip status={last.status} /> : "—"}</TD>
                  <TD>
                    <InlineActionForm
                      action={runJobAction}
                      submitLabel="Run"
                      variant="secondary"
                      hiddenFields={{ name: job.name }}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </TableWrap>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="History" title="Recent job runs" padded={false}>
          {runs.length === 0 ? (
            <EmptyState title="No runs yet" hint="Jobs record a row every time they execute." />
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Job</TH>
                  <TH>Started</TH>
                  <TH>Status</TH>
                  <TH>Detail</TH>
                </TR>
              </THead>
              <TBody>
                {runs.slice(0, 12).map((run) => (
                  <TR key={run.id}>
                    <TDPrimary>
                      <span className="numeric text-[12px]">{run.jobName}</span>
                    </TDPrimary>
                    <TD>
                      {dateOnly(run.startedAt)} {timeOnly(run.startedAt)}
                    </TD>
                    <TD>
                      <StatusChip status={run.status} />
                    </TD>
                    <TD>
                      <span className="numeric text-[11.5px] text-ink-3">
                        {run.error
                          ? run.error
                          : summarise(run.detail as Record<string, unknown> | null)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel eyebrow="Process" title="Slowest operations">
            {slowest.length === 0 ? (
              <EmptyState title="Nothing measured yet" hint="Timings appear as work is done." />
            ) : (
              <ul className="space-y-2">
                {slowest.map(([name, timing]) => (
                  <li key={name} className="flex items-center justify-between text-[12.5px]">
                    <span className="numeric truncate text-ink">{name}</span>
                    <span className="numeric text-ink-3">
                      p95 {timing.p95Ms} ms · {timing.count} calls
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="Process" title="Counters">
            {counters.length === 0 ? (
              <EmptyState title="No counters yet" hint="Counters increment as requests arrive." />
            ) : (
              <ul className="space-y-2">
                {counters.map(([name, value]) => (
                  <li key={name} className="flex items-center justify-between text-[12.5px]">
                    <span className="numeric truncate text-ink">{name}</span>
                    <span className="numeric text-ink-3">{n(value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="Process" title="Metrics endpoint">
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              The same counters are exported in Prometheus text format at{" "}
              <code className="numeric text-ink">/api/metrics</code>, and as JSON at{" "}
              <code className="numeric text-ink">/api/metrics?format=json</code>. A
              Prometheus or Grafana instance can scrape it without any change to the
              application.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** A short, readable summary of a job's detail payload. */
function summarise(detail: Record<string, unknown> | null): string {
  if (!detail) return "—";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      parts.push(`${key}: ${value.length}`);
      continue;
    }
    if (typeof value === "object") {
      parts.push(`${key}: ${Object.keys(value as object).length}`);
      continue;
    }
    parts.push(`${key}: ${String(value)}`);
  }
  return parts.length ? parts.slice(0, 4).join(" · ") : "—";
}
