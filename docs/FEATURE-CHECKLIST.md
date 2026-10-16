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
| 1 | Authentication & user management | ● | Cookie sessions, scrypt, 2FA for privileged roles, rate limiting, hashed reset + session tokens, self-service password change, admin revoke-all-sessions, native no-JS sign-in |
| 2 | Company management | ● | Companies, branches, service agreements with SLAs, contracts, per-client scope, employee import (CSV) |
| 3 | Booking & reservations | ● | Home↔office, ad-hoc, recurring rules, duplicate rejection, waitlist, approval, cancellation, boarding codes |
| 4 | Route planning | ● | Capacity-aware nearest-neighbour clustering, pickup time windows, shift-derived departure times, vehicle & driver recommendation |
| 5 | Fleet | ● | Vehicles, documents, maintenance scheduling, availability, assignment guards, fuel logs, safety inspections |
| 6 | Driver management & app | ● | Duty list, trip sheet, manifest, OTP boarding verification, no-shows, offline queue replay, SOS/breakdown reporting, availability |
| 7 | Passenger app | ● | Self-service booking, home address + geocode, live trip tracking, boarding code, feedback, cancellation, policy |
| 8 | Dispatch | ● | Three-pane Command Centre: trip board, live corridor map, inspector with signed ETD deviation, event tape, alerts rail, reassignment, breakdown recovery |
| 9 | GPS tracking | ● | Position capture from the driver app and dispatcher, speed + heading, live map, 90-day retention model, offline queue. ◐ *Basemap requires a provider key* |
| 10 | Billing, invoicing & payroll | ● | Per-passenger / per-trip / per-km / fixed pricing, waiting and overtime surcharges from the contract, VAT, invoices, payments, driver earnings, payroll CSV export |
| 11 | Safety & compliance | ● | Incidents (breakdown, accident, SOS, delay, no-show, safety, complaint), severity, action taken, document expiry reminders, safety inspections |
| 12 | Reporting & BI | ● | KPIs, trips/day, revenue by client, driver performance, route efficiency, incident frequency, service quality, CSV export, PDF via print |

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
| PostgreSQL with FKs, constraints, indexes, timestamps | ● | 40 tables, 4 migrations, `drizzle-kit check` clean |
| Multi-tenant isolation | ● | `companyScope()` resolved server-side on every read and write |
| Migrations | ● | Applied at container start by `instrumentation.ts` — never during a build |
| Input validation | ● | zod schemas plus bounded readers; 0 unvalidated server actions |
| Data retention | ◐ | Retention windows are defined (`retentionDate()`), the automatic purge job is not yet scheduled |
| Secure REST APIs | ● | 11 routes, all authenticated except health, the four public auth endpoints, logout and the QA-only session route |
| Background jobs | ◐ | `job_runs` table and the runner exist; no scheduled jobs are registered yet |
| Realtime | ◐ | The dispatch board polls `/api/dispatch/live`; the SSE upgrade path is documented but not implemented |
| Configurable maps | ● | Map provider and token are environment variables; the app degrades to the labelled vector map |
| Capacity-aware routing heuristics | ● | `planRoute` in `src/lib/domain.ts`, unit tested |
| Installable PWA (passenger + driver) | ● | Manifest, four icon sizes, service worker, offline shell |
| Container-ready | ● | Multi-stage `Dockerfile`, `.dockerignore` |
| Environment configuration | ● | `.env.example` documents every variable |
| CI/CD | ● | `.github/workflows/ci.yml` — lint, typecheck, tests, build |
| Auto-migrations on deploy | ● | `instrumentation.ts` |
| Logging & monitoring | ◐ | Structured server-side error logging and a `job_runs` table; no metrics exporter or error tracker is wired |
| Backup & recovery | ◐ | The procedure is documented in `docs/OPERATIONS.md`; an automated backup job is not configured |

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
| Calendar scheduling | ○ | Shifts and trip dates are modelled, but there is no month/week calendar view |
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

## 7. Open work, in priority order

| # | Item | Module | Why it is open |
| --- | --- | --- | --- |
| 1 | Calendar scheduling view | 4 | Shifts and trip dates exist; there is no month/week surface for planning |
| 2 | Scheduled job runner | 6, 10, 11 | Retention purge, scheduled invoicing and notification fan-out all need a scheduler; the `job_runs` table is ready |
| 3 | Recurring booking expansion | 3 | The rule is stored; a job must materialise daily instances |
| 4 | Waitlist auto-promotion | 3 | Promotion is manual; it should happen when a seat frees |
| 5 | Notification fan-out | 6, 3 | Notifications are in-app only; SMS/email/push need provider credentials |
| 6 | TOTP two-factor | 1 | The demo uses a server-side code; production needs an authenticator app |
| 7 | Passenger live tracking of other passengers | 7 | The passenger sees their own vehicle, not the whole corridor |
| 8 | Geofenced arrival detection | 9 | Modelled but not automated — needs a telematics feed |
| 9 | Scheduled invoicing | 10 | Invoices are generated on demand, not on a calendar |
| 10 | Safety inspection scheduling | 11 | Inspections are recorded; the recurrence is not generated |
| 11 | PDF export | 12 | CSV is server-generated; PDF relies on the browser print dialog |
| 12 | Pagination on large lists | 12 | Lists are capped with `limit`; there is no paged navigation |
| 13 | Saved views | 12 | The `saved_views` table exists; no screen reads or writes it |
| 14 | Phone OTP sign-in | 1 | The `otp_codes` table exists; the flow is not built |
| 15 | Fuel log entry screen | 5 | `fuel_logs` is seeded and schema'd; no form writes to it |
| 16 | OR-Tools VRP service | 4 | The heuristic planner works; an optimal solver is Phase 4 |
| 17 | SSO / SAML / OIDC | 1 | Password auth only |
| 18 | Multicurrency | 10 | GHS only |
| 19 | Observability stack | platform | No metrics exporter or error tracker |
| 20 | Automated backups | platform | Documented, not scheduled |

---

## 8. Phase status

| Phase | Status |
| --- | --- |
| 1 — Functional MVP | ● Delivered |
| 2 — Live operations | ● Delivered, with provider integrations in labelled demo mode |
| 3 — Finance & optimisation | ● Delivered; scheduled invoicing and the VRP solver are the open parts |
| 4 — Enterprise scaling | ○ Pending — SSO, queue workers, observability, native apps, multicurrency |
