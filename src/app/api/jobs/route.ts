import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canAccess, type Role } from "@/lib/rbac";
import { recentJobRuns, registeredJobs, runJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** The job registry and the recent run history. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAccess(user.role as Role, "audit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [runs, definitions] = await Promise.all([
    recentJobRuns(40),
    Promise.resolve(registeredJobs()),
  ]);
  return NextResponse.json({
    jobs: definitions.map((job) => ({
      name: job.name,
      description: job.description,
      everyMinutes: job.everyMinutes,
      runOnBoot: job.runOnBoot,
    })),
    runs,
  });
}

/** Run a job now. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAccess(user.role as Role, "audit")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  if (!body.name) {
    return NextResponse.json({ error: "A job name is required." }, { status: 400 });
  }
  const outcome = await runJob(body.name);
  return NextResponse.json(outcome, { status: outcome.status === "failed" ? 500 : 200 });
}
