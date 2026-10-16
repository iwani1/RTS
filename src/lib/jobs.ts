/**
 * Background job runner.
 *
 * Every scheduled behaviour in the product — expanding recurring bookings,
 * promoting waitlisted passengers, raising monthly invoices, detecting
 * geofence arrivals, purging expired data — is a job. Jobs are plain async
 * functions registered in `JOB_DEFINITIONS`; the runner records each attempt
 * in `job_runs` so an operator can see what ran, when, and what it did.
 *
 * The runner starts from `src/instrumentation.ts` after the migrations and
 * the seed. It is a single-process timer, which is the right shape for the
 * deployment target here (one application container plus a managed
 * PostgreSQL). A multi-instance deployment should run the same job names from
 * one dedicated worker instead — `runJob` is idempotent, so that switch is a
 * configuration change, not a rewrite.
 */
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export type JobContext = {
  /** How many days ahead a job should look. */
  horizonDays: number;
  /** Whether the job may change data. Disabled in read-only deployments. */
  writable: boolean;
};

export type JobDefinition = {
  name: string;
  description: string;
  /** Interval in minutes. */
  everyMinutes: number;
  /** Run once at boot as well as on the interval. */
  runOnBoot: boolean;
  run: (context: JobContext) => Promise<Record<string, unknown>>;
};

export type JobOutcome = {
  name: string;
  status: "succeeded" | "failed" | "skipped";
  detail?: Record<string, unknown>;
  error?: string;
  durationMs: number;
};

const registry = new Map<string, JobDefinition>();

/** Register a job. Call once per job at module load. */
export function defineJob(definition: JobDefinition): JobDefinition {
  registry.set(definition.name, definition);
  return definition;
}

export function registeredJobs(): JobDefinition[] {
  return [...registry.values()];
}

/**
 * Run one job and record the attempt.
 *
 * The record is written before and after the work so a crash still leaves a
 * `running` row behind, which is how an operator spots a job that died.
 */
export async function runJob(
  name: string,
  overrides: Partial<JobContext> = {},
): Promise<JobOutcome> {
  const definition = registry.get(name);
  const context: JobContext = {
    horizonDays: overrides.horizonDays ?? 14,
    writable: overrides.writable ?? true,
  };

  if (!definition) {
    return {
      name,
      status: "failed",
      error: `No job named "${name}" is registered.`,
      durationMs: 0,
    };
  }
  if (!context.writable) {
    return { name, status: "skipped", error: "Read-only deployment.", durationMs: 0 };
  }

  const startedAt = new Date();
  const [run] = await db
    .insert(jobRuns)
    .values({ jobName: name, status: "running", startedAt })
    .returning({ id: jobRuns.id });

  const began = Date.now();
  try {
    const detail = await definition.run(context);
    await db
      .update(jobRuns)
      .set({ status: "succeeded", finishedAt: new Date(), detail })
      .where(eq(jobRuns.id, run.id));
    return {
      name,
      status: "succeeded",
      detail,
      durationMs: Date.now() - began,
    };
  } catch (error) {
    const message = (error as Error)?.message ?? String(error);
    await db
      .update(jobRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: message,
      })
      .where(eq(jobRuns.id, run.id));
    console.error(`[job] ${name} failed:`, message);
    return { name, status: "failed", error: message, durationMs: Date.now() - began };
  }
}

/** The most recent run of each job, for the operations screen. */
export async function recentJobRuns(limit = 40) {
  return db
    .select()
    .from(jobRuns)
    .orderBy(desc(jobRuns.startedAt))
    .limit(limit);
}

/* ------------------------------------------------------------- the runner */

const globalForJobs = globalThis as typeof globalThis & {
  __staffrideJobTimer?: NodeJS.Timeout;
  __staffrideJobsStarted?: boolean;
};

let lastRun = new Map<string, number>();

/**
 * Start the scheduler. Safe to call more than once — the second call is a
 * no-op, which matters because the instrumentation hook can run again on a
 * hot reload.
 */
export function startJobRunner(): void {
  if (globalForJobs.__staffrideJobsStarted) return;
  globalForJobs.__staffrideJobsStarted = true;

  const tick = async () => {
    const now = Date.now();
    for (const job of registeredJobs()) {
      const intervalMs = job.everyMinutes * 60_000;
      const previous = lastRun.get(job.name) ?? 0;
      if (now - previous < intervalMs) continue;
      lastRun.set(job.name, now);
      // Fire and forget: a slow job must not delay the others.
      void runJob(job.name).catch(() => undefined);
    }
  };

  void tick();
  globalForJobs.__staffrideJobTimer = setInterval(() => {
    void tick();
  }, 60_000);

  // Do not hold the process open on shutdown.
  globalForJobs.__staffrideJobTimer.unref?.();
}

/** Run every job that is marked `runOnBoot`. Used at server start. */
export async function runBootJobs(): Promise<JobOutcome[]> {
  const outcomes: JobOutcome[] = [];
  for (const job of registeredJobs()) {
    if (!job.runOnBoot) continue;
    outcomes.push(await runJob(job.name));
  }
  return outcomes;
}

/** Stop the scheduler. Used in tests and on graceful shutdown. */
export function stopJobRunner(): void {
  if (globalForJobs.__staffrideJobTimer) {
    clearInterval(globalForJobs.__staffrideJobTimer);
    globalForJobs.__staffrideJobTimer = undefined;
  }
  globalForJobs.__staffrideJobsStarted = false;
}
