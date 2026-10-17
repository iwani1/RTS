#!/usr/bin/env node
/**
 * End-to-end check of the OpenID Connect sign-in.
 *
 * A small identity provider runs on this machine: it issues an
 * authorization code, checks the PKCE challenge against the verifier it is
 * given, and returns a profile. The check then drives the real application
 * — the sign-in link, the redirect to the provider, the callback, the
 * session — and proves that a person can sign in with the provider's
 * account.
 *
 * The application must be started with the provider's address:
 *
 *   OIDC_ISSUER=http://127.0.0.1:4311 \
 *   OIDC_CLIENT_ID=rts-demo \
 *   OIDC_CLIENT_SECRET=demo-secret \
 *   OIDC_REDIRECT_URI=http://127.0.0.1:3000/api/auth/oidc/callback \
 *   npm start
 *
 * Usage: node scripts/oidc-check.mjs [baseUrl]
 */
import http from "node:http";
import { createHash } from "node:crypto";

const BASE = (process.argv[2] ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ISSUER_PORT = Number(process.env.OIDC_ISSUER_PORT ?? 4311);
const ISSUER = `http://127.0.0.1:${ISSUER_PORT}`;

const checks = [];
let failures = 0;

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures += 1;
  const mark = condition ? "ok  " : "FAIL";
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

const codes = new Map(); // code -> { challenge, redirectUri, clientId, email }
const issuedTokens = new Set();

function startProvider() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", ISSUER);

    if (url.pathname === "/authorize") {
      const clientId = url.searchParams.get("client_id") ?? "";
      const challenge = url.searchParams.get("code_challenge") ?? "";
      const method = url.searchParams.get("code_challenge_method") ?? "";
      const state = url.searchParams.get("state") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const code = `code-${Math.random().toString(36).slice(2, 10)}`;
      codes.set(code, { challenge, method, redirectUri, clientId, state });
      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      res.writeHead(302, { Location: target.toString() });
      res.end();
      return;
    }

    if (url.pathname === "/token" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const form = new URLSearchParams(body);
        const code = form.get("code") ?? "";
        const verifier = form.get("code_verifier") ?? "";
        const record = codes.get(code);
        const digest = createHash("sha256").update(verifier).digest("base64url");
        if (!record) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unknown code" }));
          return;
        }
        if (record.challenge !== digest) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "pkce mismatch" }));
          return;
        }
        codes.delete(code);
        const token = `token-${Math.random().toString(36).slice(2, 10)}`;
        issuedTokens.add(token);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: token,
            token_type: "Bearer",
            expires_in: 3600,
            id_token: "unused-in-this-check",
          }),
        );
      });
      return;
    }

    if (url.pathname === "/userinfo") {
      const authorization = req.headers.authorization ?? "";
      const token = authorization.replace(/^Bearer\s+/i, "");
      if (!issuedTokens.has(token)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad token" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sub: "rts-demo-subject",
          email: "dispatch@richietransportgh.com",
          name: "Dispatch Desk",
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  return server;
}

function cookieJar(headers) {
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((entry) => entry.split(";")[0]).join("; ");
}

async function main() {
  const provider = startProvider();
  await new Promise((resolve) => provider.listen(ISSUER_PORT, "127.0.0.1", resolve));

  try {
    // 1. The sign-in page offers the provider when one is configured.
    const page = await fetch(`${BASE}/login`);
    const html = await page.text();
    check(
      "the sign-in page offers single sign-on",
      html.includes("Continue with single sign-on"),
    );

    // 2. The start route redirects to the provider with PKCE.
    const start = await fetch(`${BASE}/api/auth/oidc`, { redirect: "manual" });
    check("the start route redirects", start.status === 307, `status ${start.status}`);
    const location = start.headers.get("location") ?? "";
    const authUrl = new URL(location);
    check("the provider address is used", authUrl.origin === ISSUER, authUrl.origin);
    check(
      "the client id is sent",
      authUrl.searchParams.get("client_id") === "rts-demo",
      authUrl.searchParams.get("client_id") ?? "",
    );
    check(
      "a PKCE challenge is sent",
      (authUrl.searchParams.get("code_challenge") ?? "").length > 20,
    );
    check(
      "the challenge method is S256",
      authUrl.searchParams.get("code_challenge_method") === "S256",
    );
    const state = authUrl.searchParams.get("state") ?? "";
    check("a state value is sent", state.length > 10);
    const jar = cookieJar(start.headers);
    check("the state is kept in a cookie", jar.includes("oidc_state="));
    check("the verifier is kept in a cookie", jar.includes("oidc_verifier="));

    // 3. The provider sends the browser back with a code.
    const authorize = await fetch(location, { redirect: "manual" });
    check("the provider redirects back", authorize.status === 302, `status ${authorize.status}`);
    const callbackUrl = authorize.headers.get("location") ?? "";
    const callback = new URL(callbackUrl);
    check("the code comes back", Boolean(callback.searchParams.get("code")));
    check("the state comes back", callback.searchParams.get("state") === state);

    // 4. The application exchanges the code and signs the person in.
    const finish = await fetch(callbackUrl, {
      redirect: "manual",
      headers: { cookie: jar },
    });
    check("the callback accepts the sign-in", finish.status === 303, `status ${finish.status}`);
    const home = finish.headers.get("location") ?? "";
    check("the person lands in the application", !home.includes("/login?error"), home);
    const sessionJar = cookieJar(finish.headers);
    check("a session cookie is issued", /tms_session=/.test(sessionJar), sessionJar.slice(0, 60));

    // 5. The session really works.
    const me = await fetch(`${BASE}/api/health`, { headers: { cookie: sessionJar } });
    check("the application answers the session", me.ok);

    // 6. A sign-in attempt with the wrong state is refused.
    const tampered = new URL(callbackUrl);
    tampered.searchParams.set("state", "not-the-state");
    const refused = await fetch(tampered.toString(), {
      redirect: "manual",
      headers: { cookie: jar },
    });
    check(
      "a tampered state is refused",
      (refused.headers.get("location") ?? "").includes("error="),
      refused.headers.get("location") ?? "",
    );

    // 7. A second person through the same flow, to prove it is not a one-off.
    const second = await fetch(`${BASE}/api/auth/oidc`, { redirect: "manual" });
    const secondLocation = second.headers.get("location") ?? "";
    const secondJar = cookieJar(second.headers);
    const secondAuthorize = await fetch(secondLocation, { redirect: "manual" });
    const secondCallback = secondAuthorize.headers.get("location") ?? "";
    const secondFinish = await fetch(secondCallback, {
      redirect: "manual",
      headers: { cookie: secondJar },
    });
    check(
      "a second sign-in works",
      secondFinish.status === 303 &&
        !(secondFinish.headers.get("location") ?? "").includes("error="),
    );
  } finally {
    await new Promise((resolve) => provider.close(resolve));
  }

  console.log(
    `\nsingle sign-on: ${checks.length - failures}/${checks.length} checks passed`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`\nThe single sign-on check could not run: ${error.message}`);
  console.error(
    `Start the application with OIDC_ISSUER=${ISSUER} OIDC_CLIENT_ID=rts-demo OIDC_CLIENT_SECRET=demo-secret and try again.`,
  );
  process.exit(1);
});
