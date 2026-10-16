import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Test-harness session endpoint.
 *
 * It exists so an automated smoke test can obtain a session without a
 * browser. It is **disabled in production** — the route returns 404 unless
 * `TEST_SESSION_TOKEN` is set and the same value is presented in the
 * `x-test-token` header. Without that header, there is no way in.
 *
 *   node scripts/smoke.mjs
 *   TEST_SESSION_TOKEN=secret curl -H "x-test-token: secret" \
 *     -d "email=admin@staffridegh.com" http://127.0.0.1:3000/api/test/session
 */
export async function POST(request: Request) {
  const expected = process.env.TEST_SESSION_TOKEN;
  if (!expected || request.headers.get("x-test-token") !== expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let email = "";
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { email?: string };
      email = String(body.email ?? "");
    } else {
      const form = await request.formData();
      email = String(form.get("email") ?? "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  email = email.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: "No such user" }, { status: 404 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true, email: user.email });
}
