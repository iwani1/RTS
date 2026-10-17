# Richie Transport Services Management System

A production-oriented, multi-client transportation management system (TMS) for a company running
daily home-to-office / office-to-home staff shuttle operations. Built with **Next.js 16 (App Router) +
React 19 + TypeScript + Tailwind CSS v4 + PostgreSQL (Drizzle ORM)**.

Everything is persisted in a real PostgreSQL database — there are no frontend-only sample arrays, and every
button, form and dashboard action performs a real, authorised server operation.

---

> **New here?** [docs/USER-GUIDE.md](docs/USER-GUIDE.md) is a guide to the system **by role** — what
> each of the six roles sees, what they are responsible for, and the words the system uses.

## 1. Run it on your own computer

### What you need

| | |
| --- | --- |
| **Node.js** | 20.9 or newer — `node -v`. The app was built and tested on Node 22. |
| **npm** | ships with Node. |
| **A database** | optional. Without one the app runs on an embedded PostgreSQL — see below. |
| **Disk** | ~500 MB for `node_modules`, ~300 MB for the build, ~100 MB for the demo database. |

Nothing else. There is no database server to install and no API key to obtain before you can see the
app working.

### Step 1 — get the code and install

> **Clone the `arena/1ef49b8d-rts` branch.** The default `main` branch still holds the original
> upload, not the finished build.

```bash
git clone --branch arena/1ef49b8d-rts https://github.com/iwani1/RTS.git
cd RTS
npm ci
```

Without git, download the branch as a zip and unpack it:
<https://github.com/iwani1/RTS/archive/refs/heads/arena/1ef49b8d-rts.zip>

`npm ci` installs exactly what the lockfile pins. Use `npm install` only if you are deliberately
changing a dependency. It takes about twenty seconds on a normal connection and needs roughly
800 MB of disk.

### Updating your copy

**If you cloned the default `main` branch by mistake** — it still holds the original upload, not the
finished build — move onto the right branch first:

```bash
git fetch origin
git checkout -B arena/1ef49b8d-rts origin/arena/1ef49b8d-rts
```

**To pull new work** once you are on that branch:

```bash
cd RTS
git pull origin arena/1ef49b8d-rts
```

Or let the helper do it. It refuses to run over uncommitted work, only ever fast-forwards, and
tells you when the dependencies changed:

```bash
./scripts/pull-latest.sh
```

If the pull brought a new `package.json`, run `npm ci` again, then `npm run build` and restart
`npm start`. Your database is not touched by any of this: the seed lives in `.data/`, so your
data survives every update.

### Step 2 — choose how to run it

**Option A — the production build (recommended for testing the real thing).**
This is the same build CI produces and the container runs. It is fast, it uses far less memory than
the dev server, and it is the mode the automated tests exercise.

```bash
npm run build
npm start                 # http://localhost:3000
```

`npm start` runs the standalone server — the same bundle the container runs. The build step copies
the migrations and the client assets into it, so a rebuild never takes the demonstration database
with it and the app is styled from the first request.

**Option B — the dev server (for changing the code).**
Hot reload, on-demand compilation. Heavier on memory — if you are on a machine with less than 4 GB
free, use Option A.

```bash
npm run dev               # http://localhost:3000
```

**Option C — the container.**

```bash
docker build -t rts .
docker run --rm -p 3000:3000 rts
```

### Step 3 — sign in

Open **http://localhost:3000** and use one of the seeded accounts below. The database is created,
migrated and seeded **at server start** — you never run a migration command by hand.

### The database

| | |
| --- | --- |
| **Embedded (default)** | Leave `DATABASE_URL` empty. The app runs on **PGlite** — a real PostgreSQL engine compiled to WebAssembly, executing the same migration files in-process. The data lives in `.data/pgdata` next to the project. |
| **A real PostgreSQL** | `cp .env.example .env`, set `DATABASE_URL=postgresql://user:pass@host:5432/rts`, then start the app. The schema and the seed are applied to it the same way. |

> **PGlite is single-process.** Only one process may open `.data/pgdata` at a time. Stop the server
> before running a second one:
>
> ```bash
> npm run stop            # stops this project's own server, nothing else
> npm start
> ```
>
> If the server was ever killed uncleanly, the data directory is left locked. Reset it and let it
> rebuild:
>
> ```bash
> rm -rf .data/pgdata && npm start
> ```
>
> The seed is idempotent, so the demonstration dataset comes straight back.

### Testing from another device on your network

Bind to every interface so the server answers on your LAN address as well as on `localhost`:

```bash
npm run dev:lan          # development
HOSTNAME=0.0.0.0 npm start   # production build
```

Then open `http://192.168.1.42:3000` on the other device, where `192.168.1.42` is your machine's
address. Find it with `ip addr` on Linux, `ipconfig getifaddr en0` on macOS, or `ipconfig` on
Windows. The driver and passenger apps are installable PWAs — open the browser menu and choose
*Add to Home Screen*.

Two things to know:

- **The port must be open in your firewall.** macOS asks on first run; Linux often does not.
- **React server actions check the origin.** A browser that loads the app from
  `http://192.168.1.42:3000` sends that same address as the `Origin`, so it matches the host the
  request arrived on and is allowed. If you put the app behind a reverse proxy that rewrites the
  `Host` header, the two no longer match — list the public address in
  `SERVER_ACTION_ALLOWED_ORIGINS` (comma-separated). In development the variable is read when the
  server starts; in a production build it is compiled in, so set it before `npm run build`.

  ```bash
  SERVER_ACTION_ALLOWED_ORIGINS=192.168.1.42 npm run build
  ```

- **The session cookie follows the connection, not the build.** It is marked `Secure` when the
  request arrived over https, and left unmarked over plain http — a browser only keeps a `Secure`
  cookie on a trusted origin, so marking it over plain http on a LAN address made the sign-in
  appear to do nothing. Set `SESSION_COOKIE_SECURE=false` to force it off, `true` to force it on.

### If something goes wrong

| Symptom | What it means | What to do |
| --- | --- | --- |
| `Another process is already using the local database` | A second server opened the same data directory. PGlite is single-process. | Stop the other server, or give this one its own directory: `PGLITE_DATA_DIR=.data/pgdata-dev npm run dev` |
| `RuntimeError: Aborted()` on start | The data directory was left open by a process that was killed. | `rm -rf .data/pgdata && npm start` — the schema and the seed are rebuilt automatically |
| A server action returns "Invalid Server Actions request" | The browser's origin does not match the host the request arrived on. | Browse to the same address you typed, or list the public origin in `SERVER_ACTION_ALLOWED_ORIGINS` |
| `npm run test:smoke` says the session route is missing | The server was started without `TEST_SESSION_ENABLED=true` and a `TEST_SESSION_TOKEN`. | Start the server with both: `TEST_SESSION_ENABLED=true TEST_SESSION_TOKEN=local-qa-token npm start` |
| "Too many failed attempts. Try again in 15 minutes." | The sign-in throttle saw five failed attempts for that account in fifteen minutes. | Wait for the window to pass, or reset the local database with `rm -rf .data/pgdata` |
| Signing in from another device bounces back to the sign-in page | The browser dropped the session cookie. On a LAN address over plain http that means the cookie was marked `Secure`. | Update the code (`git pull origin arena/1ef49b8d-rts`), rebuild, and set `SESSION_COOKIE_SECURE=false` if it persists |
| The dev server is slow or is killed | The dev server compiles on demand and uses a lot of memory. | Use the production build: `npm run build && npm start` |
| `EADDRINUSE: address already in use 0.0.0.0:3000` | Something is already on that port — most often an earlier copy of this app that is still running. The app now names the process and its PID. | `npm run stop && npm start` — the helper stops this project's own processes and leaves everything else alone. Or `kill <pid>` and run `npm start` again, or `PORT=3100 npm start` |
| `getaddrinfo ENOTFOUND <your-machine-name>` | An old build bound to the shell's `HOSTNAME`, which bash sets to the machine's name. | `HOSTNAME=0.0.0.0 npm start` — or pull the latest, where the bind address is decided by the app |
| The server listens only on loopback | `BIND_HOST` is set to `127.0.0.1`. | `BIND_HOST=0.0.0.0 npm start` |

### Running the checks yourself

With the server running in another terminal:

```bash
export TEST_SESSION_TOKEN=local-qa-token     # the server must be started with the same value
npm run test:smoke     # route checks across all six roles
npm run test:auth      # the native, no-JavaScript sign-in flow
npm run test:action    # the server-action transport
npm run test:demo      # 54 checks: the live end-to-end demonstration
npm run test:origin    # 5 checks: the Server Action origin guard
npm run test:login     # can all eight demo accounts actually sign in?
npm run test:sso       # the OIDC sign-in flow, against a stand-in identity provider
npm run test:delivery  # a real message through a stand-in SMS gateway
npm run roles          # what each role can reach, read from the permission matrix
npm run verify         # lint · typecheck · unit tests · migration drift · role matrix
```

The last two need the server started with the provider's address, for example
`SMS_PROVIDER_ENDPOINT=http://127.0.0.1:4312/v1/messages/send` for the delivery check and
`OIDC_ISSUER=http://127.0.0.1:4311` for the sign-on check. Both stand-ins run on the machine and are
started by the script.

`TEST_SESSION_TOKEN` is what the server expects on `POST /api/test/session`, and
`TEST_SESSION_ENABLED=true` is what opens that route. The token signs in as **any** account with
no password and no second factor, so the route stays closed unless it is explicitly enabled:

```bash
TEST_SESSION_ENABLED=true TEST_SESSION_TOKEN=local-qa-token npm start
```

The route returns 404 unless both are set and the token matches, so it is inert in a deployment
that has never opted in.

### Demo accounts — password `Password123!`

| Role | Email | Notes |
| --- | --- | --- |
| Super Administrator | `admin@richietransportgh.com` | 2FA code `246810` |
| Operations Manager | `ops@richietransportgh.com` | |
| Dispatcher | `dispatch@richietransportgh.com` | |
| Fleet Manager | `fleet@richietransportgh.com` | |
| Finance Officer | `finance@richietransportgh.com` | |
| Corporate HR (Sikaman) | `hr@sikamanfinancial.com` | sees only its own client |
| Employee (Sikaman) | `ama@sikamanfinancial.com` | passenger app |
| Driver | `driver.kwesi@richietransportgh.com` | driver app |

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

`scripts/smoke.mjs` signs in as each of the six roles and requests every route each role can reach —
67 checks covering the portal, the mobile apps, the detail pages and the API.

`scripts/demo.mjs` is the live demonstration: 54 checks that sign in through the real login form, walk
every screen, and exercise saved views, pagination, PDF export, the route-optimisation solver, the job
runner, live tracking, multicurrency and the observability stack. Its form submissions take the same
multipart path a browser without JavaScript would take, so the no-JavaScript behaviour is tested rather
than simulated.

---

## 2b. Pitching it in ten minutes

`docs/PITCH.md` is the run sheet: the order to open the screens, the accounts to sign in as, the
one line for each likely question, and the two commands that prove it while the room is watching.

```bash
npm run demo:reset      # fresh demonstration data, then start the server
npm run demo:check     # 54 checks: the whole walkthrough, re-read from the running server
```

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
| Live GPS tracking & map | ✅ Phase 2 (Mapbox when a token is set) | `/dispatch`, `/api/dispatch/live` |
| Boarding OTP verification, no-shows | ✅ Phase 2 | `/driver/trip/[id]` |
| Incidents, SOS, breakdown workflow, safety documents | ✅ Phase 2 | `/incidents` |
| Offline driver actions + sync | ✅ Phase 2 | `/api/driver/sync` |
| Invoicing, payments, waiting/overtime surcharges, driver payroll | ✅ Phase 3 | `/finance` |
| Analytics, CSV exports, server-rendered PDF exports | ✅ Phase 3 | `/reports`, `/api/reports/export`, `/api/reports/pdf` |
| Audit trail | ✅ Phase 3 | `/audit` |
| Installable PWA (driver + passenger), offline shell | ✅ Phase 2 | `public/manifest.webmanifest`, `public/sw.js`, `/offline` |
| Calendar scheduling view | ✅ Phase 3 | `/calendar` |
| Scheduled job runner — recurring expansion, waitlist promotion, invoicing, inspections, geofence, purge, backup | ✅ Phase 3 | `src/lib/scheduled-jobs.ts`, `/operations` |
| Notification fan-out + delivery worker (Hubtel SMS, SMTP e-mail) | ✅ Phase 3 | `src/lib/notify.ts`, `src/lib/delivery.ts`, `src/lib/providers/` |
| TOTP, phone OTP, OIDC/PKCE single sign-on | ✅ Phase 3 | `src/lib/totp.ts`, `src/lib/otp.ts`, `src/lib/sso.ts` |
| Online collection of invoices (Paystack / Flutterwave, signed webhook) | ✅ Phase 3 | `src/lib/payments.ts`, `src/lib/providers/payments.ts`, `/api/payments/[provider]` |
| Passenger corridor view, live tracking of the corridor, share codes | ✅ Phase 3 | `/passenger/corridor` |
| Multicurrency, exchange rates, per-currency agreements | ✅ Phase 3 | `src/lib/currency.ts`, `/currencies` |
| Route optimisation solver | ◐ heuristic, not OR-Tools | `/optimise`, `src/lib/vrp.ts` |
| Observability stack — JSON logs, Prometheus metrics | ✅ Phase 3 | `src/proxy.ts`, `/api/metrics` |
| Automated backups | ✅ Phase 3 | `src/lib/backup.ts`, `/operations` |
| Pagination and saved views | ✅ Phase 3 | `src/components/ui/pagination.tsx`, `src/components/saved-views.tsx` |
| Live identity provider, push delivery, native apps, queue workers | ⏳ Phase 4 | see `/docs` roadmap |

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
  rbac.ts           6 roles · 19 sections · 14 permissions
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
proxy.ts            timing, request counters, one JSON log line per request
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
docker build -t rts .
docker run -p 3000:3000 -e DATABASE_URL=postgresql://… rts
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
| `docs/RTS-User-Guide.pdf` | The client-facing guide — how every role uses the system, in one pitchable document (regenerate with `npm run docs:pdf`) |
| `docs/USER-GUIDE.md` | How to use the system, organised by role — what each of the six roles sees, owns and does |
| `docs/ARCHITECTURE.md` | Mermaid diagrams — system context, layers, request lifecycle, ERD, tenancy, auth, boot, interface, deployment |
| `docs/API.md` | REST + server action reference, request/response shapes |
| `docs/OPERATIONS.md` | SOPs, rollout plan, runbook, backup and recovery |
| `docs/FEATURE-CHECKLIST.md` | Per-module implemented / partial / pending ledger, with the open work in priority order |
| `docs/AUDIT.md` | The full system audit — findings, resolutions, verification, known limitations |
| `docs/prompt-gap-map.md` | The master-prompt → code map and the original gap list |
| `DESIGN.md` | The interface contract — tokens, type, motion, component rules |
| `/docs` | The same documentation rendered in-app |
