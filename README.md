# StaffRide — Enterprise Staff Transportation Management System

A production-oriented, multi-client transportation management system (TMS) for a company running
daily home-to-office / office-to-home staff shuttle operations. Built with **Next.js 16 (App Router) +
React 19 + TypeScript + Tailwind CSS v4 + PostgreSQL (Drizzle ORM)**.

Everything is persisted in a real PostgreSQL database — there are no frontend-only sample arrays, and every
button, form and dashboard action performs a real, authorised server operation.

---

## 1. Quick start

### With PostgreSQL

```bash
npm install
cp .env.example .env              # set DATABASE_URL
npm run build && npm run start    # or: npm run dev
```

Migrations and the demonstration dataset are applied automatically at **server start** by
`src/instrumentation.ts`. You never run a migration command by hand.

### Without a database server

Leave `DATABASE_URL` empty and the platform runs on **PGlite** — a real PostgreSQL engine compiled to
WebAssembly, executing the same migration files in-process. This is how the demo boots with nothing
installed.

```bash
npm install
npm run dev
```

> PGlite is **single-process**. Only one process may open the data directory at a time. If a second
> process writes to it, reset it with `rm -rf .data/pgdata && npm run dev`.

### Demo accounts — password `Password123!`

| Role | Email | Notes |
| --- | --- | --- |
| Super Administrator | `admin@staffridegh.com` | 2FA code `246810` |
| Operations Manager | `ops@staffridegh.com` | |
| Dispatcher | `dispatch@staffridegh.com` | |
| Fleet Manager | `fleet@staffridegh.com` | |
| Finance Officer | `finance@staffridegh.com` | |
| Corporate HR (Sikaman) | `hr@sikamanfinancial.com` | sees only its own client |
| Employee (Sikaman) | `ama@sikamanfinancial.com` | passenger app |
| Driver | `driver.kwesi@staffridegh.com` | driver app |

The seeded dataset holds 3 corporate clients, ~36 employees, 12 vehicles, 10 drivers, routes, trips,
bookings, invoices, incidents, maintenance records and audit entries.

---

## 2. Verification

```bash
npm run verify          # lint + typecheck + unit tests + schema drift check
npm run build           # production build (needs no database)
npm run audit:authz     # server-action authorisation and validation audit
```

Route smoke test, with the server running:

```bash
TEST_SESSION_TOKEN=local-qa-token npm run dev
TEST_SESSION_TOKEN=local-qa-token npm run test:smoke
TEST_SESSION_TOKEN=local-qa-token npm run test:auth
TEST_SESSION_TOKEN=local-qa-token npm run test:action
TEST_SESSION_TOKEN=local-qa-token npm run test:demo
```

`scripts/auth-form.mjs` asserts the native (no-JavaScript) sign-in flow: a bad password returns a friendly
error, a good password issues a session that opens the dashboard, logout clears it, and an unknown address
gets a neutral password-reset response. The public auth screens post to real route handlers precisely so
that authentication never depends on a script bundle loading.

`scripts/action-invoke.mjs` replays the browser's server-action request shape and asserts that an action
resolves, runs, and returns a guarded result rather than a crash.

`scripts/smoke.mjs` signs in as each of the eight roles and requests every route each role can reach —
67 checks covering the portal, the mobile apps, the detail pages and the API.

`scripts/demo.mjs` is the live demonstration: 54 checks that sign in through the real login form, walk
every screen, and exercise saved views, pagination, PDF export, the route-optimisation solver, the job
runner, live tracking, multicurrency and the observability stack. Its form submissions take the same
multipart path a browser without JavaScript would take, so the no-JavaScript behaviour is tested rather
than simulated.

---

## 3. Modules delivered

| Module | Status | Where |
| --- | --- | --- |
| Authentication, RBAC, 2FA, rate limiting, audit trail | ✅ Phase 1 | `/login`, `/register`, `/forgot-password`, `src/lib/auth.ts`, `src/lib/rbac.ts` |
| Corporate client & branch management, SLAs | ✅ Phase 1 | `/companies`, `/companies/[id]` |
| Employee register, shifts, CSV import, policies | ✅ Phase 1 | `/employees` |
| Bookings, recurring rules, waiting list, duplicates | ✅ Phase 1 | `/passenger`, `/bookings` |
| Route planning & optimisation (capacity-aware heuristic) | ✅ Phase 1/2 | `/routes`, `src/lib/domain.ts` |
| Fleet, documents, maintenance, fuel, inspections | ✅ Phase 1 | `/fleet` |
| Driver management & mobile duty app | ✅ Phase 1/2 | `/drivers`, `/driver`, `/driver/trip/[id]` |
| Dispatch Command Centre (board · map · inspector) | ✅ Phase 1/2 | `/dispatch` |
| Live GPS tracking & map | ✅ Phase 2 (demo provider) | `/dispatch`, `/api/dispatch/live` |
| Boarding OTP verification, no-shows | ✅ Phase 2 | `/driver/trip/[id]` |
| Incidents, SOS, breakdown workflow, safety documents | ✅ Phase 2 | `/incidents` |
| Offline driver actions + sync | ✅ Phase 2 | `/api/driver/sync` |
| Invoicing, payments, waiting/overtime surcharges, driver payroll | ✅ Phase 3 | `/finance` |
| Analytics, CSV exports, server-rendered PDF exports | ✅ Phase 3 | `/reports`, `/api/reports/export`, `/api/reports/pdf` |
| Audit trail | ✅ Phase 3 | `/audit` |
| Installable PWA (driver + passenger), offline shell | ✅ Phase 2 | `public/manifest.webmanifest`, `public/sw.js`, `/offline` |
| Calendar scheduling view | ✅ Phase 3 | `/calendar` |
| Scheduled job runner — recurring expansion, waitlist promotion, invoicing, inspections, geofence, purge, backup | ✅ Phase 3 | `src/lib/scheduled-jobs.ts`, `/operations` |
| Notification fan-out, TOTP, phone OTP, OIDC/PKCE | ✅ Phase 3 | `src/lib/notify.ts`, `src/lib/totp.ts`, `src/lib/otp.ts`, `src/lib/sso.ts` |
| Passenger corridor view, live tracking of the corridor, share codes | ✅ Phase 3 | `/passenger/corridor` |
| Multicurrency, exchange rates, per-currency agreements | ✅ Phase 3 | `src/lib/currency.ts`, `/currencies` |
| Route optimisation solver | ◐ heuristic, not OR-Tools | `/optimise`, `src/lib/vrp.ts` |
| Observability stack — JSON logs, Prometheus metrics | ✅ Phase 3 | `src/middleware.ts`, `/api/metrics` |
| Automated backups | ✅ Phase 3 | `src/lib/backup.ts`, `/operations` |
| Pagination and saved views | ✅ Phase 3 | `src/components/ui/pagination.tsx`, `src/components/saved-views.tsx` |
| Real identity provider, real SMS/e-mail/push delivery, native apps, queue workers | ⏳ Phase 4 | see `/docs` roadmap |

The full per-module ledger — implemented, partial and pending — is `docs/FEATURE-CHECKLIST.md`.

---

## 4. Architecture

```
Next.js App Router (React server components)
├── (auth)          login / register / password recovery
├── (portal)        role-aware workspace shell (sidebar driven by the RBAC matrix)
├── actions/        61 server actions — every mutation is authorised, validated and audited
├── api/            REST: health, metrics, dispatch/live, driver/sync, jobs, reports/export,
│                   reports/pdf, search, views/save, views/delete, auth/*, test/session
components/         UI primitives, app shell, SVG charts, vector map, dispatch centre
db/                 Drizzle schema (42 tables) + lazily initialised driver
lib/
  auth.ts           hashed sessions, scrypt, throttling, guards, audit, tenant scope
  rbac.ts           8 roles · 20 sections · 15 permissions
  domain.ts         pure business rules (no framework imports → unit testable)
  queries.ts        analytics aggregations
  validation.ts     zod schemas and bounded form readers
  jobs.ts           the background runner and the global job registry
  scheduled-jobs.ts the eight registered jobs
  notify.ts         notification fan-out with a real delivery status
  currency.ts       multicurrency · conversion · formatting
  totp.ts / otp.ts  authenticator codes · hashed phone codes
  sso.ts            OIDC authorisation-code flow with PKCE
  observability.ts  JSON logs · counters · latency percentiles
  pdf.ts            a dependency-free PDF writer
  vrp.ts            Clarke-Wright savings + 2-opt routing solver
  seed.ts           demonstration dataset
instrumentation.ts  migrate + seed + register the jobs at server start
middleware.ts       timing, request counters, one JSON log line per request
drizzle/            5 migrations
```

**The driver is created lazily.** `next build` imports every route module to collect page data, so a
module-scope database connection would make the build depend on a live database — and would apply
migrations during a compile. Migrations now run at server start instead.

**Technology substitutions** (documented deliberately):

* **Drizzle ORM** instead of Prisma — identical relational guarantees, lighter runtime, direct SQL when needed.
* **Cookie sessions + scrypt** instead of a managed auth provider — no external dependency; the swap-in
  point is `src/lib/auth.ts` only. Session and password-reset tokens are stored as SHA-256 hashes, so a
  database disclosure cannot be replayed.
* **Polling REST feed** instead of WebSockets — works on serverless and containers; `LiveMap` polls
  `/api/dispatch/live` and can be replaced by a socket subscription without touching the UI.
* **PGlite fallback** instead of a local PostgreSQL install — the same migrations, the same SQL, no
  server to provision.

---

## 5. Security & privacy

* Server-side authorisation on every action (`requirePermission`, `guard()`), plus tenant scoping on
  `companyId` resolved by `companyScope()`.
* Passwords hashed with async scrypt (per-user salt, timing-safe comparison) — the derivation never
  blocks the event loop.
* Sessions are DB-backed with a 7-day expiry; only a SHA-256 hash of the token is stored.
* Login and password-reset requests are rate limited: five failures per identifier inside a 15-minute
  window, with a generic response that cannot be used to enumerate accounts.
* 2FA is required for privileged roles (super admin, ops manager, finance officer). A TOTP authenticator
  app is the primary factor; phone one-time codes are also available.
* Home addresses, phone numbers and GPS history are exposed only to the roles that need them — a driver
  sees passengers only on their own duty.
* Every mutation writes an audit log entry with actor, entity, tenant and payload.
* Retention: GPS events 90 days, audit logs 24 months, sessions 7 days — enforced by a scheduled purge job.
* The metrics endpoint is closed to anonymous callers unless `METRICS_PUBLIC=true` is set.
* The authorisation audit reports 61 server actions, 61 guarded and 0 unvalidated.

---

## 6. Container & CI

```bash
docker build -t staffride .
docker run -p 3000:3000 -e DATABASE_URL=postgresql://… staffride
```

The image is a three-stage build (deps → build → runtime) and runs as a non-root user with a health
check. Migrations are applied at container start, not baked into the image, so a rolling deploy
migrates exactly once.

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, the schema drift check, the authorisation
audit, a production build and the route smoke test on every push, and builds the container image.

---

## 7. Further reading

| Document | Contents |
| --- | --- |
| `docs/ARCHITECTURE.md` | Mermaid diagrams — system context, layers, request lifecycle, ERD, tenancy, auth, boot, interface, deployment |
| `docs/API.md` | REST + server action reference, request/response shapes |
| `docs/OPERATIONS.md` | SOPs, rollout plan, runbook, backup and recovery |
| `docs/FEATURE-CHECKLIST.md` | Per-module implemented / partial / pending ledger, with the open work in priority order |
| `docs/AUDIT.md` | The full system audit — findings, resolutions, verification, known limitations |
| `docs/prompt-gap-map.md` | The master-prompt → code map and the original gap list |
| `DESIGN.md` | The interface contract — tokens, type, motion, component rules |
| `/docs` | The same documentation rendered in-app |
