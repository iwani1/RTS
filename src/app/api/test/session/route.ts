import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Test-harness session endpoint.
 *
 * It exists so an automated smoke test can obtain a session without a
 * browser. It is **closed unless it is explicitly enabled** — the route
 * returns 404 unless `TEST_SESSION_ENABLED=true` is set *and* the caller
 * presents the matching `TEST_SESSION_TOKEN` in the `x-test-token` header.
 * The token is a master key: it signs in as any account, with no password
 * and no second factor, so it is never enabled by accident.
 *
 *   TEST_SESSION_ENABLED=true TEST_SESSION_TOKEN=secret npm start
 *   node scripts/smoke.mjs
 *   TEST_SESSION_TOKEN=secret curl -H "x-test-token: secret" \
 *     -d "email=admin@richietransportgh.com" http://127.0.0.1:3000/api/test/session
 */
export async function POST(request: Request) {
  // The token bypasses the password and the second factor for any account,
  // so it is a master key. Two things have to be true before it works: the
  // route has to be enabled explicitly, and the caller has to present the
  // token. A built server runs with NODE_ENV=production, so the opt-in is
  // what keeps the route closed in a deployment that merely happens to have
  // a token in its environment.
  if (process.env.TEST_SESSION_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const expected = process.env.TEST_SESSION_TOKEN ?? "";
  const presented = request.headers.get("x-test-token") ?? "";
  // The token is a master key, so it is compared in constant time: a plain
  // `!==` leaks the length and the first differing character through the
  // time the answer takes.
  const matches =
    expected.length > 0 &&
    presented.length === expected.length &&
    timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
  if (!matches) {
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
