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
| GPS events | 90 days | purge job on `gps_events.recorded_at` — the window is defined in `retentionDate()`; the scheduled job is still open |
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
docker build -t staffride .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/staffride \
  -e SEED_ON_BOOT=false \
  staffride
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

### Backups

* Nightly `pg_dump` with 30-day retention; point-in-time recovery via WAL archiving.
* The audit trail is append-only and is the record of who changed what — it is included in the backup.

### Monitoring

* `/api/health` for liveness and a database check.
* Structured server-side error logging; the audit trail is the business-level log.
* Alert on open critical incidents and on document-expiry spikes.

### Scaling

* Stateless app instances behind a load balancer; pooled PostgreSQL.
* Move GPS ingestion to a queue plus a time-series store beyond roughly 50 vehicles.

## 6. Verification before a release

```bash
npm run verify        # lint · typecheck · unit tests · schema drift
npm run test:smoke   # 67 route checks across all eight roles (server running)
npm run test:auth    # native, no-JavaScript sign-in flow (server running)
npm run test:action  # server-action transport + guard (server running)
npm run build         # production build, no database required
npm run audit:authz   # server-action authorisation and validation audit
```

With the server running and `TEST_SESSION_TOKEN` set, `npm run test:smoke` signs in as each of the eight
roles and requests every reachable route — 67 checks covering the portal, the mobile apps, the detail
pages and the API.

## 7. Known limitations

* Mapping, SMS, email and payment providers are implemented as documented interfaces with demo behaviour until
  credentials are configured (clearly labelled in the interface with a `Notice`).
* Recurring bookings store the rule; a scheduler is required to expand daily/weekly/monthly instances.
* Geofenced arrival detection is modelled via timestamps and grace windows; automation requires a telematics feed.
* 2FA uses a server-side code for the demo — production should use TOTP or SMS.
* The retention purge, scheduled invoicing and notification fan-out all need a job runner; the `job_runs`
  table and the runner exist, but no jobs are registered yet.
