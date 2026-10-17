# Richie Transport Services — System Audit

**Date:** 2026-10-16
**Scope:** the whole application — build pipeline, database, authentication, authorisation, tenant isolation, input validation, design conformance, and the deliverable set required by the master build prompt.
**Method:** every finding below was read out of the source or reproduced with a command. Nothing is inferred from naming. Where a finding could not be confirmed by reading, it is not listed as a defect.

---

## 1. Verdict

| Gate | Before | After |
| --- | --- | --- |
| `npx next build` | **FAILED** — page-data collection opened the database | **PASS** |
| `npx tsc --noEmit` | PASS | PASS |
| `npx eslint src` | **4 errors** | **0 errors** |
| `npm test` (node:test) | 15/15 | 15/15 |
| `drizzle-kit check` | no drift | no drift |
| Route smoke test (6 roles) | not present | **every check passes** |
| Server actions without an authz guard | 5 (all legitimately anonymous) | 5 (all legitimately anonymous) |
| Server actions reading form data with no validator | 46 | **0** |
| Screens on the legacy component API | 8 | **0** |
| Emoji in the interface | 13 | **0** |
| Missing spec deliverables | 5 | **0** |

The blocking defect was the build. Everything else on this page was a real
defect, a hardening opportunity, or a missing deliverable — and all of them
are now closed or explicitly documented as a limitation.

---

## 2. Findings and resolutions

### P0 — blocking

#### P0-1 · The production build could not complete
**Evidence.** `rm -rf .next && npx next build` compiled and typechecked, then
failed at page-data collection:

```
Failed to collect page data for /api/auth/logout
  Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"
  RuntimeError: Aborted()
```

`src/db/index.ts` constructed `new PGlite(dataDir)` and awaited
`migrated` at **module scope**. `next build` imports every route module to
collect page data, so the build opened a database, ran migrations against it,
and then failed. Beyond breaking the build, this meant a production compile
would apply migrations to the target database as a side effect of building.

**Resolution.** The driver is now created lazily on first query
(`src/db/index.ts`), the module-scope `await migrated` is gone, and
`runMigrations()` is exported. Migrations and seeding now run from
`src/instrumentation.ts` `register()`, which Next invokes at **server start**,
never during a build. The PGlite path is additionally scoped with
`turbopackIgnore` comments so the file tracer stops tracing the whole project.

**Verification.** `npx next build` → 37 routes compiled, 0 warnings, 0 errors.

---

### P1 — security

#### P1-0 · The sign-in form could not be submitted without JavaScript
**Evidence.** A no-JS browser posts the `useActionState` form with
`encType="multipart/form-data"`. Next 16.2.6 only accepts
`application/x-www-form-urlencoded` on its no-JS server-action path
([vercel/next.js#95447](https://github.com/vercel/next.js/issues/95447)), so
the request was parsed as urlencoded, the action reference was never
resolved, and the server answered:

```
Failed to find Server Action. This request might be from an older or newer deployment.
```

A user whose script bundle failed to load — a corporate proxy that strips
JavaScript, a device with scripting disabled, a transient 500 from a CDN —
could not sign in at all. Every other screen needs JavaScript, but the gateway
did not have to.

**Resolution.** The four public auth screens (sign in, register, recover,
reset) now post to real route handlers:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/login` | Verifies credentials, issues the session, redirects to the role home route |
| `POST /api/auth/register` | Creates a pending or self-activating account |
| `POST /api/auth/forgot-password` | Issues a single-use reset token |
| `POST /api/auth/reset-password` | Consumes the token and sets the new password |

Each handler calls the **same server action** that the JavaScript path used,
so there is exactly one implementation of the credential rules, the throttling
and the audit trail. The handler only adapts the HTTP shape: it turns the
action's result into a `303` redirect carrying a message, which the page
renders as an inline notice. `scripts/auth-form.mjs` asserts the whole flow
(bad password → friendly error, good password → session cookie → authenticated
page, logout, neutral reset response) and runs in CI.


#### P1-1 · Session bearer tokens were stored in plaintext
**Evidence.** `sessions.token` was the primary key and held the raw cookie
value. `createSession` wrote the token, `getSessionUser` read it back. A read
of the database — a leaked backup, a SQL injection elsewhere, a misconfigured
replica — would hand over every live session in the platform.

**Resolution.** `sessions.token` → `sessions.token_hash` (migration
`0003_hash_session_tokens.sql`). The cookie still carries the raw token; the
database carries its SHA-256. Lookups hash the cookie value before querying.
Pre-existing sessions were invalidated by the migration, because they stored
raw tokens that can no longer be matched.

#### P1-2 · Password-reset tokens were stored in plaintext
**Evidence.** `requestPasswordResetAction` inserted `tokenHash: token` — the
raw token, in a column named `token_hash`. `resetPasswordAction` matched on
it with `eq(passwordResets.tokenHash, token)`. Anyone with read access to
`password_resets` could reset any account's password.

**Resolution.** The token is hashed with the same `hashToken()` helper before
it is written, and the lookup hashes the submitted token.

#### P1-3 · Authentication was not rate limited
**Evidence.** `login_attempts` existed in the schema with an index on
`(identifier, created_at)` and was **never written to**. `loginAction` was an
unthrottled oracle, and `scryptSync` meant every attempt blocked the event
loop — a password spray was also a denial of service.

**Resolution.** `assertLoginAllowed()` counts failures per identifier inside a
15-minute window and locks after five. `recordLoginAttempt()` writes every
attempt (success and failure). The reset-password request path is throttled
separately so it cannot be used to spam mailboxes. The lockout response is
identical for a wrong password and a wrong two-factor code, and the reset
request returns the same message whether or not the account exists.

#### P1-4 · No input validation on 46 server actions
**Evidence.** Zero zod usage across the action layer. The form reader was
`const num = (fd, key) => raw === "" ? null : Number(raw)` — `Number("abc")`
is `NaN`, so a malformed id reached the database as `eq(employees.id, NaN)` and
surfaced as a 500 rather than a friendly message. Strings were unbounded.

**Resolution.**
- A new `src/lib/validation.ts` provides zod schemas and bounded form readers
  (`requiredString`, `optionalNumber`, `optionalEnum`, `passwordPair`, …).
- The `num`/`dec` helpers now return `null` for anything that is not a finite
  number, so a malformed id is treated as "missing" and produces the action's
  own friendly error.
- `str` caps input length at the column width.
- The auth actions (login, register, reset, change password) and
  `inviteUserAction` validate with zod end to end.

**Verification.** `scripts/audit-authz.py` → *unvalidated actions: 0*.

#### P1-5 · A corporate administrator could write to another tenant's employees
**Evidence.** `toggleEmployeeAction` and `assignEmployeeShiftAction` are
guarded by `employee.manage`, which includes `corporate_admin`, but they
updated `employees` with only `eq(employees.id, id)` — no `companyId` check. A
corporate HR administrator could deactivate, or re-shift, an employee belonging
to a different client.

**Resolution.** Both actions now load the target employee, compare its
`companyId` against `companyScope(user)`, and refuse when they differ.
`assignEmployeeShiftAction` additionally verifies that the target shift belongs
to the same company as the employee.

#### P1-6 · Branch and shift ids were not tenant-validated
**Evidence.** `createEmployeeAction`, `importEmployeesAction` and
`createShiftAction` accepted a `branchId` / `shiftId` straight from the form.
A corporate administrator could attach another tenant's branch to their
employee record, and a stale or hostile id would point an employee at someone
else's office.

**Resolution.** `resolveBranchId()` and `resolveShiftId()` load the referenced
row and return `false` when it belongs to a different company; the action then
refuses with a specific message.

#### P1-7 · Password hashing blocked the event loop
**Evidence.** `hashPassword` used `scryptSync`. scrypt is deliberately slow —
that is the point — but synchronously it stalls every request on the server.
Combined with the missing rate limit (P1-3), a burst of login attempts was a
self-inflicted denial of service.

**Resolution.** `hashPassword` and `verifyPassword` are now async and use
`promisify(scrypt)`. All call sites await them. The comparison is a constant-
time `timingSafeEqual`.

#### P1-8 · A permission failure produced a 500 instead of a 403
**Evidence.** `guard()` and `requirePermission()` threw a raw `Error`, which
Next renders as a 500 error page. The user was told the server broke, not
that they may not do the thing.

**Resolution.** `src/lib/action-guard.ts` introduces `PermissionError` and
`ValidationError`, and `withAction()` wraps every one of the 48 server
actions. A thrown error now becomes an inline, friendly message; a permission
failure reads as a permission failure. Postgres constraint violations are
translated ("That record already exists.", "That record is still referenced
elsewhere."). Next's control-flow errors (`redirect`, `notFound`) are
re-thrown untouched.

---

### P2 — robustness and operations

#### P2-0 · The standalone container could not find its migrations
**Evidence.** `next build` with `output: "standalone"` emits
`.next/standalone/server.js`, and that server changes the working directory to
the bundle folder. The migration runner resolved `drizzle/` from
`process.cwd()`, so the container booted with:

```
[rts] Database migration failed.
  Can't find meta/_journal.json file
```

**Resolution.** `resolveMigrationsFolder()` in `src/db/index.ts` walks a list of
candidates — `MIGRATIONS_FOLDER`, the working directory, its parents, and the
bundle root — and selects the first that actually contains
`meta/_journal.json`. A `postbuild` step also copies `drizzle/` into
`.next/standalone/drizzle`, so the artifact is self-contained.



| # | Finding | Resolution |
| --- | --- | --- |
| P2-1 | `getSessionUser` swallowed every error, so a database outage presented as "everyone is logged out" | The catch was removed. A database failure now fails loudly instead of silently signing the fleet out. |
| P2-2 | No way to revoke every session for a user | New `revokeUserSessionsAction` (super admin / operations manager), surfaced as a "Sign out" row action on `/settings`. Deactivating a user already killed their sessions; this handles a lost device. |
| P2-3 | The CSV export route hand-rolled a second copy of the tenant-scope rules | It now calls `companyScope(user)`, the same helper the rest of the app uses. |
| P2-4 | The PWA manifest was referenced from the root layout but no `public/` directory existed — `/manifest.webmanifest` returned 404 | `public/manifest.webmanifest` and a four-size icon set were generated from the design tokens. A `sw.js` service worker, an `/offline` shell and `PwaRegister` complete the installable PWA requirement for the driver and passenger apps. |
| P2-5 | Four ESLint `react-hooks/set-state-in-effect` errors | Theme, density and the sidebar rail are `localStorage`-backed external state and are now read with `useSyncExternalStore` (with a stable server snapshot, so hydration stays clean). The command palette mounts its body only while open, which removes the reset effect entirely. |
| P2-6 | The dev server rejected the sandboxed preview origin, so the live preview's HMR socket never connected | `allowedDevOrigins` added to `next.config.ts`. |
| P2-7 | A corrupt local PGlite directory aborted the server with an opaque WASM error and no recovery hint | The boot path now prints the cause and the exact recovery command. The underlying cause was a second process writing to the single-process PGlite directory — documented in `docs/OPERATIONS.md`. |

---

### P3 — design conformance

`DESIGN.md` is a contract, not a mood board. Eight screens were still rendered
with the pre-contract component API and the old palette, and thirteen emoji
were embedded in the interface.

**Resolution.** All eight screens — `settings`, `reports`, `companies/[id]`,
`trips/[id]`, `passenger`, `passenger/trips`, `driver`, `driver/trip/[id]` —
were rewritten onto `Panel` / `MetricStrip` / `TableWrap` / `StatusChip` /
`Field` / `Button` / `Notice`. The legacy shims (`Card`, `StatCard`,
`StatusBadge`, `Table`, `Td`, `LinkButton`, `inputClass`, `buttonClass`) were
**deleted** from `src/components/ui/index.tsx` so no new screen can drift back
to the old API. The landing page and the documentation page were rebuilt on
the marketing spine (asymmetric hero, real product visual, proof numbers read
from the database, pillar grid, step path, security band, full-bleed CTA band,
editorial footer).

**Verification.** No legacy component usage remains; zero emoji in `src/`.

---

### P3 — deliverable gaps

The master prompt lists sixteen deliverables. Five were missing.

| Deliverable | Status |
| --- | --- |
| Seed data | Present — `src/lib/seed.ts`, `src/lib/seed-ext.ts`, idempotent |
| `.env.example` | Present — extended with `PGLITE_DATA_DIR`, `SEED_ON_BOOT`, `TEST_SESSION_TOKEN` |
| Automated tests | Present — 15 domain tests (`npm test`) + `scripts/smoke.mjs` (67 route checks) |
| Setup / deploy documentation | Present — `README.md`, `docs/OPERATIONS.md` |
| API documentation | Present — `docs/API.md` |
| Architecture + database diagrams | **Added** — `docs/ARCHITECTURE.md` (Mermaid) |
| Operational SOPs | Present — `docs/OPERATIONS.md`, `/docs#operations` |
| Phased roadmap | Present — `/docs#roadmap`, `docs/prompt-gap-map.md` |
| Feature checklist | **Added** — `docs/FEATURE-CHECKLIST.md` |
| Container-ready | **Added** — `Dockerfile`, `.dockerignore` |
| CI/CD | **Added** — `.github/workflows/ci.yml` |
| Audit report | **Added** — this document |

---

## 3. Verified as *not* broken

These were checked against the source and deliberately left alone:

- `reportIncidentFromAppAction` — delegates to the guarded `createIncidentAction`.
- `createBookingAction` — scoped to the caller's own employee row.
- `decideBookingAction` — corporate administrator company check present.
- `driverTripAction` and `api/driver/sync` — trip-ownership checks present.
- `api/reports/export` — role check and tenant scope present.
- `createEmployeeAction` / `importEmployeesAction` / `createShiftAction` — company forced to the caller's own for a corporate administrator (plus the new branch/shift checks).
- `api/auth/logout` and `api/health` — intentionally unauthenticated.
- Drizzle schema and migrations — no drift (`drizzle-kit check` clean, `generate` produces nothing).
- The 15 domain tests — pricing, capacity, routing and transition rules all pass.

---

## 4. Known limitations (deliberate, documented, not defects)

1. **Mapping provider.** The map is a hand-drawn vector lattice with honest
   labelling. A Mapbox or Google key is required for a road basemap.
2. **SMS, email and push.** Notifications are persisted in-app and delivered on
   login. Provider delivery needs SMTP / Arkesel / Firebase credentials.
3. **Payments.** Payment rows are reconciliation entries. A live gateway needs
   Paystack or Flutterwave credentials.
4. **Two-factor authentication.** The demo stores a server-side code. Production
   should use TOTP or SMS.
5. **Recurring bookings.** Stored as a rule on the booking; a scheduler job must
   expand them into daily instances.
6. **Geofenced arrival detection.** Modelled (arrival timestamps, grace
   windows) but not automated — that needs a telematics feed.
7. **Realtime.** The dispatch board polls `/api/dispatch/live`. The upgrade path
   to SSE is documented; WebSockets are not implemented.
8. **PDF export.** CSV is generated server side; PDF uses the browser print
   dialog with the print stylesheet.
9. **Recurring scheduler, OR-Tools VRP, SSO/SAML, multicurrency, native mobile
   apps and a queue worker** are Phase 4 and are listed as pending in
   `docs/FEATURE-CHECKLIST.md`.
10. **PGlite is single-process.** The local fallback database cannot be opened
    by two processes at once. Production uses `DATABASE_URL` and has no such
    limit.
11. **JavaScript is required inside the authenticated app.** The public auth
    screens work without it (see P1-0), but the command centre, the live map,
    the inspector drawer and the data tables are client components. This is the
    same trade-off every Next.js application makes; a no-JS build would need a
    different rendering strategy.
12. **The password-reset link is shown on screen.** No mail provider is
    configured in this environment, so the token is returned to the user
    instead of being emailed. An attacker who can read the response can also
    learn whether an account exists. Wiring an SMTP provider closes both.

---

## 5. How to re-run this audit

```bash
npx tsc --noEmit -p tsconfig.json      # types
npx eslint src                          # lint
npm test                                # domain rules (node:test)
npx drizzle-kit check                   # schema / migration drift
python3 scripts/audit-authz.py          # server-action authorisation + validation
npx next build                          # production build
rm -rf .next && npx next build          # from a cold cache
```

With the server running:

```bash
TEST_SESSION_TOKEN=local-qa-token node scripts/smoke.mjs   # route checks, 6 roles
node scripts/auth-form.mjs                                 # native (no-JS) auth flow + CSRF guard
node scripts/action-invoke.mjs                             # server-action transport + guards
node scripts/origin-check.mjs                             # the Server Action origin guard
node scripts/latency.mjs                                   # p50 / p95 for the read paths
node scripts/demo.mjs                                      # the live demonstration, 55 checks
```

Two of the checks start their own instance of the application, so they need nothing running:

```bash
npm run test:payment-audit   # the payment path against a stand-in provider, 27 checks
npm run test:delivery        # a real message through a stand-in SMS gateway, 16 checks
```

The harness signs in as any account, so the server must be started with it explicitly enabled:

```bash
TEST_SESSION_ENABLED=true TEST_SESSION_TOKEN=local-qa-token npm start
```

---

## 6. Second audit — dependencies, live behaviour and the deploy path

**Date:** 2026-10-16 (following the workstation-enablement work)
**Method:** `npm audit`, reading the running server, and measuring it. Every finding below was
reproduced with a command or read out of the source; the resolutions were re-verified by running
the suite again.

### 6.1 Dependency advisories

| Advisory | Severity | Exposure | Resolution |
| --- | --- | --- | --- |
| Next.js proxy bypass (App Router, Turbopack, single locale) | **critical** | The application ships `src/proxy.ts` and builds with Turbopack. The proxy is not an authorisation boundary — every permission is enforced in the route and data layer — but the advisory applies to the file that is deployed. | **Fixed.** Next 16.2.6 → 16.4.2 |
| PostCSS — XSS via unescaped `</style>` in CSS stringification; arbitrary file read through an attacker-controlled `sourceMappingURL` | high | `postcss` is a **direct** dependency, so it ships. | **Fixed.** 8.5.22 → 8.5.30 |
| sharp / libvips / libheif / librsvg | high | Transitive through Next, in the runtime image. | **Fixed.** Resolved by the Next upgrade |
| braces / fast-glob / micromatch | high | `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. **Build-time only** — `npm ls --omit=dev` shows the chain is absent from the production tree. No published fix upstream. | Pinned to the patched releases with `overrides`. Residual advisory is build-time only. |
| esbuild | moderate | `drizzle-kit` → `@esbuild-kit` → `esbuild`. The advisory is about a dev server accepting cross-origin requests; `drizzle-kit` runs the migration tool, not a server. Build-time only. | Accepted, documented. |

`npm audit` now reports **0 critical** and **0 high** in the production dependency tree.

### 6.2 The origin guard on the native auth screens

React server actions carry Next's own cross-origin check. The four public auth screens post to
**route handlers** instead, so they work with JavaScript disabled — and a route handler has no such
check. A page on another site could therefore have driven a sign-in, a sign-out, an OTP request or
a password reset in this origin. `sameSite=lax` does not close it: a sign-in does not need the
victim's cookie.

**Fixed.** `src/lib/auth-forms.ts` gained `isCrossSiteRequest()`, which compares the `Origin` (or
`Referer`) host with the host the request was addressed to and refuses a mismatch. It is applied
to the seven state-changing auth handlers. The two OpenID Connect routes are deliberately exempt:
they are top-level redirect `GET`s, a browser sends no `Origin` on a navigation, and the correct
defence for that flow is the `state` value and the PKCE verifier, both of which are already
checked on the callback.

`scripts/auth-form.mjs` now asserts that a cross-site sign-in is refused with 403 and issues no
session.

### 6.3 The test harness was a master key

`POST /api/test/session` signs in as **any** account with no password and no second factor. It was
gated on a shared secret alone, so a deployment that happened to have `TEST_SESSION_TOKEN` in its
environment had a full account-takeover path.

**Fixed.** The route now requires `TEST_SESSION_ENABLED=true` *and* the matching token. A server
with only the token answers 404 — verified against a second instance.

### 6.4 Internal error text reached the driver's device

`POST /api/driver/sync` returned `(error as Error).message` verbatim. A driver-visible response
carrying a database error names tables, columns and constraint definitions.

**Fixed.** The endpoint now maps the error through `describeError()`, the same function the server
actions use, which keeps the known messages and makes the rest generic.

### 6.5 Measured behaviour

| Surface | Result |
| --- | --- |
| Read-path latency (40 requests per endpoint) | p50 4–59 ms, p95 6–120 ms, **0 errors** across 14 endpoints |
| Live dispatch feed | 14 active trips, latest fix per trip, served in 11 ms |
| Session cookie | `httpOnly`, `sameSite=lax`, `secure` in production, token stored hashed |
| Sign-in throttle | 5 failures in 15 minutes locks the identifier |
| Retention | sessions, OTP codes, password resets, login attempts (90 d) and GPS events (90 d) are purged by a scheduled job |
| Accessibility | every button has an accessible name and every form control a label, on every screen checked |
| Build output | **zero warnings** |

### 6.6 The file-tracing rule

Next 16.4 promotes the "a file was traced that indicates that the whole project was traced"
warning to a **build failure**. The path helpers were rewritten around a single scoped
`path.join(process.cwd(), ".data")`, so the bundler traces the data folder and nothing else.
The build now completes with no warnings at all.

### 6.7 Still open, and why

| Item | Status |
| --- | --- |
| `braces` / `fast-glob` / `micromatch` | Build-time only, no upstream fix. Pinned to the patched releases. |
| `esbuild` via `drizzle-kit` | Build-time only. The migration tool does not run a server. |
| The map renderer | Without `NEXT_PUBLIC_MAPBOX_TOKEN` the map draws the built-in corridor, not a survey basemap. With a token it draws a real Mapbox basemap and the markers sit where the vehicles are. |
| Push delivery | Not implemented. There is no push sender behind the app, so a push request stays in the app and is marked in-app only. |
| Live identity provider | The OIDC client is real and is proved end to end by `npm run test:sso`; no issuer is configured in this deployment, so the button is hidden. |
| Telematics integration | Positions come from the driver app or manual entry. No tracker-vendor API. |
| Multi-instance job execution | The runner is a single-process timer. Move the job names to a dedicated worker — a configuration change, not a rewrite. |

---

## 7. Third audit — the full pass

**Date:** 2026-10-17
**Method:** the application was read as a running system, not as a source tree. Every finding
below was reproduced against the live server — with a driver session, a forged form post, a
stand-in payment provider and a stand-in mail server — and every resolution was re-proved by
running the suite again. Nothing here is a suspicion.

Severity is the distance between "an inconvenience" and "a breach": **high** means a boundary was
crossed, **medium** means a promise the product makes was not kept, **low** means an operation
would cost the company money, time or trust.

### 7.1 The ⌘K search was a way around the role matrix — **high**

The palette in the top bar is on every screen, for every role. Its API answered with trips,
bookings, vehicles, drivers and employees — and it checked only the tenant, never the role.

Reproduced with the **driver** account, the lowest-trust role in the product:

| Request as the driver | Answer |
| --- | --- |
| `GET /api/search?q=SFS` | **5 employees** — names, staff codes, departments |
| `GET /api/search?q=BKG` | **5 bookings** — every booking reference |
| `GET /api/search?q=GR-` | **5 vehicles** — the whole fleet |
| `GET /trips` | 307 — refused |
| `GET /employees` | 307 — refused |

The screens were closed and the data was not.

**Fixed.** `src/app/api/search/route.ts` now gates every block of results with the same matrix the
screens use: trips need `trips`, bookings need `bookings`, vehicles need `fleet`, drivers need
`drivers` and employees need `employees`. The page results were already gated, so the palette now
answers exactly what the navigation would let the person open.

**Proved.** `scripts/smoke.mjs` gained two checks that fail if this ever comes back: as the driver
the search may return pages only, and as the administrator it must still reach the employee
register — so the gate cannot be "search returns nothing".

### 7.2 An open redirect through `returnTo` — **medium**

`authRedirect()` built the redirect with `new URL(path, request.url)`, and `path` came straight
out of a form field. `POST /api/views/save` with `returnTo=https://evil.example` answered
`303 Location: https://evil.example/…` — a link from a trusted application to a page an attacker
controls, delivered after a legitimate-looking save.

**Fixed.** `src/lib/guards.ts` gained `internalPath()`: only a plain path inside this origin is
allowed. Absolute URLs, `//host`, `/\host`, any backslash and any `scheme:` form are refused and
fall back to `/`. The same request now answers `303 Location: <this origin>/?notice=…`.

### 7.3 Two saved-view routes had no cross-site check — **low/medium**

`/api/views/save` and `/api/views/delete` were the only action-calling route handlers without
`isCrossSiteRequest()`. A page on another site could have saved or deleted a saved view in the
signed-in person's account.

**Fixed.** Both call the same guard as the seven auth handlers. A post carrying
`Origin: https://evil.example` is answered with **403**.

### 7.4 The delivery worker stranded messages for ever — **medium**

The worker marked a row `sending` before it called the provider. If the process died between the
claim and the write-back, the row stayed `sending` for good: the message was never sent, and
nothing in the product said so. The same happened to every message in a batch.

**Fixed.** `src/lib/delivery.ts` now recovers claims older than ten minutes — they go back in the
queue and the row is stamped with `updatedAt` — and the job reports how many it recovered.

### 7.5 A failed delivery was never retried — **medium**

One refusal from the provider and the message was lost. A company SMS gateway that is briefly
down loses every trip reminder in that minute.

**Fixed.** A new column, `notifications.delivery_attempts` (migration
`drizzle/0008_delivery_attempts.sql`), records the attempts. A failure re-queues the row until
three attempts have been made; after that the row is `failed` with the reason kept on it. The
settings screen shows "attempt N of 3" and the job reports `retrying` and `recovered`.

**Proved, live, against a stand-in gateway that refuses:**

```
attempt 1  →  queued      (the row goes back in the queue)
attempt 2  →  queued
attempt 3  →  failed — The SMS provider could not be reached: fetch failed (attempt 3 of 3)
```

### 7.6 The delivery worker asked the database once per message — **low**

One recipient query for every message in the batch. A hundred messages were a hundred round trips.

**Fixed.** One batched lookup (`recipientsFor()`) for the whole batch.

### 7.7 The payment callback called the provider first, and believed the URL — **medium**

`/api/payments/<provider>/callback` called the provider **before** it checked whether anyone was
waiting for that reference, so an unknown reference still produced an outbound call. It also read
the payment method from the URL, so a callback on the Flutterwave path could settle a Paystack
payment as "flutterwave" — the money was real and the method on the row was wrong.

**Fixed.** The reference is looked up locally first: an unknown reference never reaches the
provider. A provider that is not the configured one is refused. The row is settled with the
**configured** provider as the method.

**Proved.** `npm run test:payment-audit` (new) starts a second instance of the application against
a stand-in provider that records every request, and asserts that the provider received **no
request at all** for an unknown reference and for a mismatched provider.

### 7.8 The webhook only understood one provider's signature — **low/medium**

Paystack signs with `x-paystack-signature`; Flutterwave signs with `verif-hash`. The route read
the first header only, so Flutterwave webhooks were refused even though the documentation says
Flutterwave is supported.

**Fixed.** The route accepts either header — both are the HMAC-SHA512 of the raw body under the
secret key — and refuses a webhook for a provider that is not the configured one (**409**).

### 7.9 The test-session token was compared with `!==` — **low**

A master key that opens a session for any account, compared in a way that leaks how much of the
guess was right through the time the comparison takes.

**Fixed.** `src/app/api/test/session/route.ts` compares the token with `timingSafeEqual`.

### 7.10 The mail client could wait for ever, and could not talk to half the hosts — **low**

Two defects in the same client:

* after `STARTTLS` the session was replaced by the encrypted socket, which had **no timer** — a
  server that stopped answering mid-session left the worker waiting for good;
* only `AUTH LOGIN` was offered. Office 365, cPanel and several other hosts speak `AUTH PLAIN`
  only, so a correct password was still refused.

**Fixed.** The session owns the timer and re-arms it on the encrypted socket; the plain socket's
timer is removed before the upgrade, so it cannot tear the encrypted session down. The
authentication mechanisms are read from the server's own `EHLO` answer, and `PLAIN` is used when
that is what the host offers.

**Proved.** `tests/providers.test.ts` now runs a mail server that offers `AUTH PLAIN` only and one
that never answers at all: 45 unit checks pass.

### 7.11 The "Gateway check" could send to anybody — **low**

Anyone who could reach the settings screen could send an SMS or an e-mail **in the company's
name** to any number or address, and spend its airtime doing it. The check needs no such power.

**Fixed.** The check always goes to the operator's own contact details. The field is disabled and
shows the address it will use. `npm run test:delivery` now proves the point: it submits somebody
else's number and the message still goes to the operator's own phone.

### 7.12 Asking twice for a payment link opened a second transaction — **low**

Every request for a payment link created a new pending payment and a new provider transaction.
The first link was abandoned, and the provider's dashboard filled with transactions nobody was
going to pay.

**Fixed.** `requestPaymentLinkAction` returns the link that is already waiting for the invoice.
The payment audit asks twice and asserts that the provider was asked **once**.

### 7.13 The guards could not be tested where they live — **low**

`isCrossSiteRequest()` and `internalPath()` sat in a module that imports `next/server`, so a
plain Node test could not import them — the two rules that keep a foreign page out of the
application had no test at all.

**Fixed.** They moved to `src/lib/guards.ts`, which imports nothing, and `auth-forms.ts`
re-exports them so no call site changed. `tests/security.test.ts` pins down the rules: six
checks, including the proxy case where the host header has been rewritten.

### 7.14 The migration

`drizzle/0008_delivery_attempts.sql` adds `delivery_attempts` and `updated_at` to
`notifications`. `npx drizzle-kit check` reports **Everything's fine**; the application applies it
at boot, on both PGlite and PostgreSQL.

### 7.15 Checked in this round and found sound

| Check | Result |
| --- | --- |
| Secrets in the tracked files | none — only `.env.example` placeholders and test fixtures |
| `dangerouslySetInnerHTML` | once, in the layout boot script, with static content |
| SQL built by string concatenation | none in `src/`; the scripts use parameterised queries |
| Server-action authorisation | 57/57 guarded, 0 unguarded |
| The role matrix | 6 roles, 19 sections, 14 permissions; the sidebar counts are unchanged |
| Read paths | no N+1 found in the dispatch board or the live feed |
| Session cookie | `httpOnly`, `sameSite=lax`, `secure` only over https |
| The tenant boundary | every query is scoped by `companyScope()`; no cross-tenant read was found |

### 7.16 What the full pass verifies now

| Command | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **45/45** (36 before this pass; +3 mail, +6 guards) |
| `npm run test:smoke` | **56/56** (+2 search-scope regression checks) |
| `npm run demo:check` | **55/55** |
| `npm run test:payment-audit` | **27/27** (new) |
| `npm run test:delivery` | **16/16** |
| `npm run roles:check` | ROLE MATRIX PASSED |
| `npx drizzle-kit check` | Everything's fine |
| `npm run build` | compiled, no warnings |

### 7.17 Still open

The items in §6.7 are unchanged — they are deliberate boundaries rather than defects, and each one
names what it would take to close it. Nothing new was added to that list by this pass.

---

## 8. Tracking the remaining work

`docs/prompt-gap-map.md` §3 holds the 30-item gap list (T0 foundation, T1
schema ports, T2 features, T3 interface rebuild). Every T0 and T1 item and
every T3 item in that list is now closed. The open T2 items are listed with
their status in `docs/FEATURE-CHECKLIST.md`.
