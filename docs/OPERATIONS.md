# Operations guide, SOPs and roadmap

## 1. Daily standard operating procedures

### 05:00 — Pre-shift readiness (Dispatcher)
1. Open **Dispatch** and confirm every morning duty has a vehicle *and* a driver (the "Awaiting resources" KPI must be 0).
2. Review **Fleet** document alerts and **Drivers** licence alerts; anything expiring inside 7 days is escalated.
3. Confirm driver availability; drivers mark themselves available from the driver app.

### 05:15 — Route planning (Dispatcher / Ops Manager)
1. Open **Routes** → *Run the route planner*; select today's date and `Home to office`.
2. The planner groups approved bookings by client and zone, sequences pickups (nearest neighbour towards the office),
   sizes the vehicle (smallest available unit that fits), recommends the highest rated available driver and derives the
   departure time from the shift start minus route duration minus a 10 minute buffer.
3. Overflow passengers are placed on the waiting list — resolve them in **Bookings** by moving them onto spare capacity.

### 05:30 – 09:00 — Live operation (Dispatcher)
1. Monitor the dispatch map and the active duty table. Delayed or breakdown duties are highlighted.
2. Drivers start journeys from the driver app; passengers receive pickup notifications and can track the vehicle.
3. Boarding: the driver enters the passenger's 6-digit code. Wrong codes are rejected and logged.

### 09:00 — Exception closure (Dispatcher / Ops Manager)
* Record no-shows (seat released automatically), close incidents with the action taken, and confirm all morning duties
  are `completed` so analytics and driver earnings accrue.

### 16:30 — Evening drop-off planning
1. Run the planner for `Office to home`.
2. Issue manifests to drivers; drop-off confirmations are captured against the trip.

### Month end (Finance Officer)
1. **Finance** → *Generate invoice* per client for the billing period; verify the pricing model line items.
2. Record received payments (bank transfer / mobile money / gateway) to reconcile the invoice.
3. Approve accrued driver earnings and export the payroll CSV.
4. Export the operating report CSV for the client and the management pack.

## 2. Breakdown / emergency runbook

| Step | Action | System behaviour |
| --- | --- | --- |
| 1 | Driver taps **Vehicle breakdown** on the trip sheet | Trip → `breakdown`, incident created `high`, dispatch notified |
| 2 | Dispatcher opens the incident and the duty | Affected trip, vehicle and passengers identified |
| 3 | Dispatcher uses *Assign resources* | Only vehicles with free capacity ≥ booked seats and not in maintenance are listed |
| 4 | Replacement assigned | Vehicle becomes `assigned`; driver notified; passengers notified of the new vehicle |
| 5 | Dispatcher completes the duty or cancels it | Completing accrues earnings; cancelling releases passengers for replanning |
| 6 | Incident resolved with action taken | Closes the safety record, feeds the incident frequency report |

Missed pickup, no-show, overtime and overbooking follow the same pattern: the state machine and capacity guard make an
invalid operation impossible rather than merely discouraged.

## 3. Data retention

| Data | Retention | Mechanism |
| --- | --- | --- |
| GPS events | 90 days | the `purge-expired-data` job deletes on `gps_events.recorded_at`; the window is defined in `retentionDate()` |
| Sessions | 7 days | expiry enforced on every request, and revoked on password change or reset |
| Audit logs | 24 months | archive before purge |
| Passenger contact details | while employed + 90 days | cascade from `employees` |
| Invoices / payments | 10 years (statutory) | never auto-purged |

## 4. Phased roadmap (dependencies, effort, resources)

| Phase | Scope | Dependencies | Effort | Team |
| --- | --- | --- | --- | --- |
| **1 — MVP** (delivered) | Auth + RBAC, clients, employees, fleet, drivers, bookings, routes, trips, dispatch, passenger & driver apps, PostgreSQL schema, seed data | PostgreSQL, Next.js | 6–8 weeks | 1 full-stack lead, 1 mid engineer, 0.5 QA |
| **2 — Live operations** (delivered with demo providers) | GPS feed, live map, dispatch polling, notifications, boarding OTP, planner improvements, driver availability, incidents, offline queue, installable PWA | Mapping provider key, SMS/email gateway | 4–5 weeks | 1 mobile-leaning engineer, 1 backend engineer |
| **3 — Finance & optimisation** (delivered) | Invoices, payments, driver earnings & payroll export, maintenance reminders, SLA monitoring, analytics, CSV/PDF exports | Payment provider credentials, reporting requirements | 3–4 weeks | 1 backend engineer, 0.5 finance analyst |
| **4 — Enterprise scaling** (pending) | HR/SSO integrations (SAML/OIDC), OR-Tools VRP microservice, live traffic, multicurrency, native Android/iOS, queue workers, observability (logs, metrics, traces) | SSO metadata, solver infrastructure, app store accounts, DevOps capacity | 10–14 weeks | 2 engineers, 1 DevOps, 1 QA, 1 designer |

The open items inside phases 1–3 — calendar scheduling, the scheduled job runner, recurring-booking expansion, waitlist
auto-promotion, notification fan-out, scheduled invoicing, pagination, saved views — are listed with their status in
`docs/FEATURE-CHECKLIST.md` §7.

## 5. Deployment

### Container

```bash
docker build -t rts .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/rts \
  -e SEED_ON_BOOT=false \
  rts
```

* The image is a three-stage build (deps → build → runtime), runs as a non-root user and carries a
  `HEALTHCHECK` against `/api/health`.
* **Migrations are applied at container start** by `src/instrumentation.ts`, not baked into the image.
  A rolling deploy therefore migrates exactly once, at boot, against the live database. Never run a
  migration from a build step.
* `SEED_ON_BOOT=false` keeps the demonstration dataset out of a production database.

### Without a container

```bash
npm ci
npm run build
DATABASE_URL=postgresql://… npm run start
```

### On a workstation

The same two commands work on a laptop. `npm run dev` is the development server; `npm run build &&
npm start` is the production build and is the mode the test suite exercises.

```bash
npm ci
npm run build
npm start                   # http://localhost:3000
```

The database is created, migrated and seeded at server start, so there is no separate setup step.
Two rules apply on a workstation:

* **One process at a time.** PGlite is single-process. Stop the dev server before starting the
  production server, and reset the directory with `rm -rf .data/pgdata` if a process was killed
  while it held the directory open.
* **The data directory sits beside the project**, in `.data/pgdata`, not inside `.next/`, so a
  rebuild does not take the demonstration database with it.
* **One port at a time.** The port is checked before the server starts. If it is busy, the app
  says what is holding it and by which process — usually an earlier copy of the app that was
  never stopped:

  ```text
  [rts] Port 3000 is already in use — the server cannot start.

    An earlier copy of this app is still running on 0.0.0.0:3000 (process 4149).

      kill 4149     # stop it, then run npm start again

      PORT=3001 npm start    # or run on a different port
  ```

  `PORT` is honoured by `npm start` and `npm run dev`; `BIND_HOST` decides the address.

To open the app from a phone or a second machine on the same network, bind to every interface:

```bash
npm run dev:lan                  # development
HOSTNAME=0.0.0.0 npm start       # production build
```

React server actions compare the browser's `Origin` with the `Host` the request arrived on. A
browser that loaded the app from `http://192.168.1.42:3000` sends that same address as its origin,
so it is allowed without any configuration. Behind a reverse proxy that rewrites the `Host` header
the two differ, and the public address has to be listed:

```bash
SERVER_ACTION_ALLOWED_ORIGINS=192.168.1.42 npm run build   # compiled into the build
SERVER_ACTION_ALLOWED_ORIGINS=192.168.1.42 npm run dev     # read when the server starts
```

`npm run test:origin` asserts all four cases: a matching origin, a LAN address, a rewritten host
with the origin configured, and an unknown origin that is refused.

### Migrations

* Versioned SQL lives in `drizzle/` and is applied in order at boot.
* `npm run db:generate` produces a new migration after a schema change.
* `npm run db:check` verifies the schema and the migration history agree — it is part of `npm run verify`
  and of CI.

### Local database (PGlite)

Without `DATABASE_URL` the platform runs on PGlite, a real PostgreSQL engine compiled to WebAssembly that
executes the same migration files in-process.

> **PGlite is single-process.** Only one process may open the data directory at a time. If a second
> process writes to it while the server holds it open, the directory becomes unusable and the server
> aborts with `RuntimeError: Aborted()`. The recovery is:
>
> ```bash
> rm -rf .data/pgdata && npm run dev
> ```
>
> The seed is idempotent, so the dataset is rebuilt on the next start. The boot path prints this
> recovery command automatically when the migration fails.
>
> The holder of the directory records its process id in `.data/pgdata.lock`. A server that finds a
> live owner prints the name of that process and the fix before it tries to open the directory, and
> the error boundary and `/api/health` report the same recovery steps. To run two servers side by
> side, give each one its own directory:
>
> ```bash
> PGLITE_DATA_DIR=.data/pgdata-dev npm run dev
> ```

### Backups

The `backup-database` job takes an archive on a schedule and prunes to the configured retention.

| Deployment | Method | Location |
| --- | --- | --- |
| PostgreSQL | `pg_dump` of the configured `DATABASE_URL` | `BACKUP_DIR` (default `.data/backups`) |
| PGlite | a directory archive of the PGlite data directory | `BACKUP_DIR` |

```bash
BACKUP_DIR=.data/backups   # where archives are written
BACKUP_RETAIN=7            # how many archives to keep before the oldest is pruned
```

* The audit trail is append-only and is the record of who changed what — it is included in the backup.
* **Restore:** stop the application, replace the database with the archive, start it again. The migrations run at
  boot, so a restored archive is brought forward to the current schema automatically.
* The last backup and its result are on the **Operations** screen.

### Monitoring

* `/api/health` for liveness and a database check.
* One structured JSON log line per request, with a request id, the method, the route and the duration. The log
  is the machine-readable record; the audit trail is the business-level record.
* `/api/metrics` exposes Prometheus counters, latency percentiles and process uptime. It is closed to
  anonymous callers unless `METRICS_PUBLIC=true`.
* **Operations** shows the job registry, the run history, the slowest operations and the process counters.
* Alert on open critical incidents and on document-expiry spikes.

### The scheduled job runner

Eight jobs run on a timer inside the application process. Each one records a `job_runs` row before and after
its work, so a crash still leaves a `running` row behind — that is how a failed job is spotted.

| Job | Interval | What it does |
| --- | --- | --- |
| `expand-recurring-bookings` | 15 min | materialises the next 14 days of instances from a stored recurrence rule |
| `promote-waitlist` | 5 min | moves the first waitlisted passenger into a free seat and notifies them |
| `fan-out-trip-reminders` | 30 min | sends the pickup reminders for the next 24 hours |
| `raise-scheduled-invoices` | 60 min | raises the invoice for an agreement on its billing day |
| `schedule-safety-inspections` | 1440 min | generates the next inspection from its cycle |
| `detect-geofence-arrivals` | 5 min | compares the last GPS fix with the stop and records the arrival and boarding |
| `purge-expired-data` | 1440 min | removes expired sessions, one-time codes, GPS events and job runs |
| `backup-database` | 1440 min | takes an archive and prunes to the retention window |

Any job can also be run on demand from **Operations** → *Run*. `JOBS_ENABLED=false` switches the runner off
entirely. The runner is idempotent: a multi-instance deployment should run the same job names from one
dedicated worker instead, which is a configuration change rather than a rewrite.

### Scaling

* Stateless app instances behind a load balancer; pooled PostgreSQL.
* Move GPS ingestion to a queue plus a time-series store beyond roughly 50 vehicles.
* Move the job runner to a dedicated worker when running more than one application instance.

## 6. Verification before a release

```bash
npm run verify        # lint · typecheck · unit tests · schema drift
npm run test:smoke   # route checks across all six roles (server running)
npm run test:auth    # native, no-JavaScript sign-in flow (server running)
npm run test:action  # server-action transport + guard (server running)
npm run test:demo    # the live demo: 54 checks against a running server
npm run test:origin  # the Server Action origin guard: 5 checks
npm run build         # production build, no database required
npm run audit:authz   # server-action authorisation and validation audit
```

`npm run test:demo` is the end-to-end demonstration. It signs in through the real login form, walks every
screen, and exercises the features that were added last — saved views, pagination, PDF export, the route
optimisation solver, the job runner, live tracking, multicurrency and the observability stack. Its form
submissions use the same multipart path a browser without JavaScript would take, so it tests the real
no-JavaScript behaviour rather than simulating it.

With the server running and `TEST_SESSION_TOKEN` set, `npm run test:smoke` signs in as each of the eight
roles and requests every reachable route — 67 checks covering the portal, the mobile apps, the detail
pages and the API.

## 7. Known limitations

These are the honest edges of the build. Each one names what is real and what is not.

* **The route solver is a heuristic, not OR-Tools.** `/optimise` runs Clarke-Wright savings with a 2-opt pass
  over live staff locations. Time windows are soft, there is a single depot, and the solution is not proven
  optimal. The screen says this and names OR-Tools as the upgrade path. Swapping the solver means replacing
  one function in `src/lib/vrp.ts`.
* **There is no identity provider configured.** The OIDC client performs a real authorization-code exchange
  with PKCE, but without `OIDC_ISSUER` there is nothing to talk to, so the SSO buttons are hidden.
* **Messages are composed but not delivered.** SMS, e-mail and push notifications are written to the
  notification table with a delivery status of `simulated` and a copy in the server log until provider
  credentials are configured.
* **Exchange rates are indicative.** The rate table is seeded with a dated snapshot. A production deployment
  should pull live rates and record the rate actually used on an invoice, so a historical invoice never
  re-prices.
* **GPS arrives through the driver endpoint, not a vendor poller.** The geofence job works on whatever
  positions are in `gps_events`; a telematics integration is a separate piece of work.
* **The job runner is a single-process timer.** That is the right shape for one application container plus
  managed PostgreSQL. Running more than one instance means moving the job names to a dedicated worker.
* **Mapping, payment and push providers** are documented interfaces with demo behaviour until credentials are
  configured, clearly labelled in the interface.
* **The audit trail is append-only** and grows without a purge; archive it before a long-running deployment
  needs the space back.
