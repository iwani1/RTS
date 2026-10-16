# StaffRide — Feature Checklist

**Status key**
`●` implemented and working · `◐` implemented in part, with the gap named ·
`○` not built

Last reviewed: 2026-10-16. Every `●` item is exercised by the test suite or
the route smoke test; every `◐` and `○` item names what is missing.

---

## 1. The twelve modules

| # | Module | Status | Notes |
| --- | --- | --- | --- |
| 1 | Authentication & user management | ● | Cookie sessions, scrypt, TOTP authenticator apps, phone OTP sign-in, rate limiting, hashed reset + session tokens, self-service password change, admin revoke-all-sessions, native no-JS sign-in, OIDC/PKCE |
| 2 | Company management | ● | Companies, branches, service agreements with SLAs, contracts, per-client scope, employee import (CSV) |
| 3 | Booking & reservations | ● | Home↔office, ad-hoc, recurring rules, duplicate rejection, waitlist, approval, cancellation, boarding codes |
| 4 | Route planning | ● | Capacity-aware nearest-neighbour clustering, pickup time windows, shift-derived departure times, vehicle & driver recommendation, and a vehicle-routing solver screen |
| 5 | Fleet | ● | Vehicles, documents, maintenance scheduling, availability, assignment guards, fuel-log entry screen, safety inspections with recurrence |
| 6 | Driver management & app | ● | Duty list, trip sheet, manifest, OTP boarding verification, no-shows, offline queue replay, SOS/breakdown reporting, availability |
| 7 | Passenger app | ● | Self-service booking, home address + geocode, live trip tracking, the corridor view with occupancy and share codes, boarding code, feedback, cancellation, policy |
| 8 | Dispatch | ● | Three-pane Command Centre: trip board, live corridor map, inspector with signed ETD deviation, event tape, alerts rail, reassignment, breakdown recovery |
| 9 | GPS tracking | ● | Position capture from the driver app and dispatcher, speed + heading, live map, geofenced arrival detection, 90-day retention model, offline queue. ◐ *Basemap requires a provider key* |
| 10 | Billing, invoicing & payroll | ● | Per-passenger / per-trip / per-km / fixed pricing, waiting and overtime surcharges from the contract, VAT, invoices, payments, driver earnings, payroll CSV export, scheduled monthly invoicing, multicurrency |
| 11 | Safety & compliance | ● | Incidents (breakdown, accident, SOS, delay, no-show, safety, complaint), severity, action taken, document expiry reminders, safety inspections with generated recurrence, fuel log screen |
| 12 | Reporting & BI | ● | KPIs, trips/day, revenue by client, driver performance, route efficiency, incident frequency, service quality, server-generated CSV export, and server-rendered PDF export (trip register, passenger manifest, invoice) |

---

## 2. The four interfaces

| Interface | Status | Notes |
| --- | --- | --- |
| Super Admin / Operations dashboard | ● | KPI strip, trip board, live map, incidents, audit trail, user administration, platform configuration |
| Corporate Client portal | ● | Company-scoped employees, bookings, trips, routes, invoices, reports, incidents, policy |
| Driver mobile app | ● | Installable PWA, thumb-reachable primary actions, duty list, manifest, boarding verification, offline queue |
| Employee / Passenger mobile app | ● | Installable PWA, booking, live tracking, boarding code, feedback, emergency contacts |

---

## 3. The eight roles

| Role | Status |
| --- | --- |
| Super Administrator | ● |
| Operations Manager | ● |
| Dispatcher | ● |
| Corporate HR Administrator | ● — pinned to one tenant |
| Fleet Manager | ● |
| Finance Officer | ● |
| Driver | ● — pinned to own duties |
| Employee / Passenger | ● — pinned to own records |

---

## 4. Platform requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| PostgreSQL with FKs, constraints, indexes, timestamps | ● | 42 tables, 5 migrations, `drizzle-kit check` clean |
| Multi-tenant isolation | ● | `companyScope()` resolved server-side on every read and write |
| Migrations | ● | Applied at container start by `instrumentation.ts` — never during a build |
| Input validation | ● | zod schemas plus bounded readers; 0 unvalidated server actions |
| Data retention | ● | Retention windows are defined (`retentionDate()`) and the `purge-expired-data` job removes expired sessions, one-time codes, GPS events and job runs on a schedule |
| Secure REST APIs | ● | 20 routes, all authenticated except health, the public auth endpoints, logout and the QA-only session route |
| Background jobs | ● | Eight registered jobs, a single-process timer, a `job_runs` history table and a "Run now" control on `/operations` |
| Realtime | ◐ | The dispatch board polls `/api/dispatch/live`; the SSE upgrade path is documented but not implemented |
| Configurable maps | ● | Map provider and token are environment variables; the app degrades to the labelled vector map |
| Capacity-aware routing heuristics | ● | `planRoute` in `src/lib/domain.ts`, unit tested |
| Installable PWA (passenger + driver) | ● | Manifest, four icon sizes, service worker, offline shell |
| Container-ready | ● | Multi-stage `Dockerfile`, `.dockerignore` |
| Environment configuration | ● | `.env.example` documents every variable |
| CI/CD | ● | `.github/workflows/ci.yml` — lint, typecheck, tests, build |
| Auto-migrations on deploy | ● | `instrumentation.ts` |
| Logging & monitoring | ● | One structured JSON log line per request, request counters, latency percentiles and a Prometheus text endpoint at `/api/metrics` |
| Backup & recovery | ● | The `backup-database` job takes an archive on a schedule and prunes to the configured retention; the procedure is documented in `docs/OPERATIONS.md` |

---

## 5. Interface and UX requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Modern SaaS logistics look | ● | `DESIGN.md` is the contract; every screen renders through the primitives |
| Sidebar navigation | ● | Five grouped sections, collapsible 64→244px rail |
| Interactive tables | ● | Sticky header, hairline rules, tabular numerics, hover row actions |
| Search and filters | ● | ⌘K global search, per-screen filters on trips, bookings, employees, incidents, reports, audit |
| KPI cards | ● | `MetricStrip`, capped at six |
| Maps | ● | Live corridor map in dispatch and the passenger app; honest demo labelling |
| Calendar scheduling | ● | `/calendar` — month grid, load bars, status mix, per-day driver roster, month navigation |
| Status indicators | ● | Dot + word, never colour alone |
| Accessible forms | ● | Labelled controls, visible focus ring, `aria-*` on the palette and progress meters |
| Friendly errors | ● | `withAction` turns every failure into an inline, specific message |
| Dark mode | ● | Ships by default; light mode available; no flash on first paint |

---

## 6. Deliverables

| Deliverable | Status | Location |
| --- | --- | --- |
| Seed data | ● | `src/lib/seed.ts`, `src/lib/seed-ext.ts` — idempotent |
| Environment example | ● | `.env.example` |
| Automated tests | ● | `tests/domain.test.ts` (15) + `scripts/smoke.mjs` (67 route checks) |
| Setup documentation | ● | `README.md` |
| Deployment documentation | ● | `README.md`, `docs/OPERATIONS.md`, `Dockerfile` |
| API documentation | ● | `docs/API.md`, `/docs#api` |
| Architecture diagram | ● | `docs/ARCHITECTURE.md` §2, §8 |
| Database diagram | ● | `docs/ARCHITECTURE.md` §4 (Mermaid ERD) |
| Operational SOPs | ● | `docs/OPERATIONS.md`, `/docs#operations` |
| Phased roadmap | ● | `/docs#roadmap`, `docs/prompt-gap-map.md` §3 |
| Feature checklist | ● | this file |
| Audit report | ● | `docs/AUDIT.md` |

---

## 7. Feature status — the twenty open items, closed

Every item below was open when this file was first written. All twenty are
now implemented, wired to real data, and exercised by `scripts/demo.mjs`
against a running server.

| # | Item | Status | What it actually does |
| --- | --- | --- | --- |
| 1 | Calendar scheduling view | ● | `/calendar` — a month grid of trips, the busiest days as load bars, the status mix, the driver roster per day, and month navigation |
| 2 | Scheduled job runner | ● | `src/lib/jobs.ts` + `src/lib/scheduled-jobs.ts` — eight registered jobs, a single-process timer, a `job_runs` history table, and a "Run now" control on `/operations` |
| 3 | Recurring booking expansion | ● | The `expand-recurring-bookings` job materialises the next 14 days of daily instances from the stored rule, skipping dates that already exist |
| 4 | Waitlist auto-promotion | ● | The `promote-waitlist` job moves the first waitlisted passenger into a free seat and notifies them |
| 5 | Notification fan-out | ● | `src/lib/notify.ts` writes one notification per recipient, records the delivery channel and status, and marks the delivery `simulated` when no SMS/e-mail/push provider is configured |
| 6 | TOTP two-factor | ● | `src/lib/totp.ts` — RFC 6238 codes over a shared secret, with a one-period drift window; enrolment and removal are self-service on `/settings` |
| 7 | Passenger live tracking of other passengers | ● | `/passenger/corridor` — a passenger sees the whole corridor, the occupancy of the vehicle they are in, and can create or revoke a share code for the other passengers on the same trip |
| 8 | Geofenced arrival detection | ● | The `detect-geofence-arrivals` job compares the last GPS fix with the stop coordinates and records the arrival and the boarding |
| 9 | Scheduled invoicing | ● | The `raise-scheduled-invoices` job raises the invoice for a service agreement on its billing day, and skips an agreement that has already been invoiced |
| 10 | Safety inspection scheduling | ● | The `schedule-safety-inspections` job generates the next inspection from the cycle, and `/compliance` records inspections with the next due date |
| 11 | PDF export | ● | `src/lib/pdf.ts` + `/api/reports/pdf` — a dependency-free PDF writer that produces the trip register, the passenger manifest and a single invoice as real files |
| 12 | Pagination on large lists | ● | `src/components/ui/pagination.tsx` — link-based pages that preserve the active filter parameters; wired into the bookings register |
| 13 | Saved views | ● | `src/lib/views.ts` + `src/components/saved-views.tsx` — per-user named filter sets, saved and deleted through plain form posts, rendered as chips on the trips and bookings lists |
| 14 | Phone OTP sign-in | ● | `/otp` — the code is generated, hashed with scrypt, stored with an expiry and an attempt counter, and verified against the hash |
| 15 | Fuel log entry screen | ● | `/compliance` — records litres, cost, odometer and station, and derives the cost per litre and the range from the vehicle's fuel economy |
| 16 | OR-Tools VRP service | ◐ | `/optimise` runs a real solver — Clarke-Wright savings with a 2-opt pass — over live staff locations, the client campus and the available fleet. **It is not OR-Tools.** The screen says so, names OR-Tools as the upgrade path, and the solver sits behind one function so the swap is a replacement, not a rewrite |
| 17 | SSO / SAML / OIDC | ◐ | `/api/auth/oidc` performs a real authorization-code exchange with PKCE against a configured issuer. **No identity provider is configured here**, so the SSO buttons are hidden and the flow is in demo mode until `OIDC_ISSUER` is set |
| 18 | Multicurrency | ● | `src/lib/currency.ts` + `/currencies` — an `exchange_rates` table with a base currency, inline rate updates with a date stamp, and client agreements billed in their own currency. Rates are indicative, and the screen says so |
| 19 | Observability stack | ● | `src/proxy.ts` + `src/lib/observability.ts` — one structured JSON log line per request, request counters and latency percentiles, and a Prometheus text endpoint at `/api/metrics` that is session-guarded unless `METRICS_PUBLIC=true` |
| 20 | Automated backups | ● | The `backup-database` job takes an archive on a schedule — `pg_dump` against a real server, a directory archive under PGlite — and prunes to the configured retention |

Legend: ● implemented · ◐ implemented with a stated, honest limitation ·
○ not built.

### What is still genuinely open

| Item | Why | What it needs |
| --- | --- | --- |
| OR-Tools as the VRP solver | The shipped heuristic is a real solver but not an optimal one | Swap the body of `solveVrp` in `src/lib/vrp.ts`; the request and result types are already the boundary |
| A real identity provider | The OIDC client is real; there is no issuer to talk to | Set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` |
| Real SMS, e-mail and push delivery | The messages are composed and recorded, the delivery is marked `simulated` | Provider credentials; the send path already branches on them |
| Live market exchange rates | The rate table is seeded with a dated snapshot | A rate feed, and a scheduled job to refresh it |
| A real telematics feed | GPS events arrive through the driver endpoint; there is no vendor poller | A vendor integration writing into `gps_events` |
| Multi-instance job execution | The runner is a single-process timer, which is the right shape for one container plus managed PostgreSQL | Move the same job names to a dedicated worker; `runJob` is idempotent, so this is a configuration change |

---

## 8. Phase status

| Phase | Status |
| --- | --- |
| 1 — Functional MVP | ● Delivered |
| 2 — Live operations | ● Delivered — the job runner, live tracking, geofence detection, notification fan-out and TOTP are all live |
| 3 — Finance & optimisation | ● Delivered — scheduled invoicing, multicurrency, PDF export and the VRP solver are live |
| 4 — Enterprise scaling | ◐ Delivered in part — SSO/OIDC, the observability stack and automated backups are in; a real identity provider, real message delivery, OR-Tools, a dedicated job worker and native mobile apps remain |

### Verification at the time of writing

| Gate | Result |
| --- | --- |
| `npm run verify` (lint, typecheck, unit tests, migration check) | Clean |
| `npm run build` | Passes — 45 routes |
| `scripts/smoke.mjs` | 67/67 route checks |
| `scripts/auth-form.mjs` | 7/7 native sign-in checks |
| `scripts/action-invoke.mjs` | 7/7 server-action transport checks |
| `scripts/audit-authz.py` | 61 server actions, 61 guarded, 0 unvalidated |
| `scripts/demo.mjs` | 54/54 live-demo checks against a running server |
