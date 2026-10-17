# Prompt → implementation gap map

The master build prompt defines a TMS spec. This maps every numbered requirement of that spec onto
the two supplied applications, verified against the actual source, and lists what is genuinely
missing from the chosen base.

**Verdict carried forward:** base = **App A (Richie Transport Services)**, with **App B's schema and dependency
wins ported in** (App B's 29 tables are a 1:1 match to the prompt's §5 required-table list, which is
why those specific tables are in scope).

---

## 1. §5 Database architecture — the decisive finding

The prompt's required table list is: Users, **Roles and Permissions**, Companies, Company Branches,
Employees, **Addresses**, Stops, Vehicles, Drivers, Driver Shifts, Employee Shifts, Routes, Route
Stops, Trips, **Trip Assignments**, Bookings, Passenger Boarding Records, GPS Tracking Events,
Maintenance Records, Payments, Invoices, Driver Earnings, Incidents, Notifications, Service Level
Agreements, Audit Logs.

| Required table | App A | App B | Action |
| --- | :---: | :---: | --- |
| Users | ● | ● | A |
| **Roles and Permissions** | ✗ hardcoded in `rbac.ts` | ● 4 tables | **Port from B** |
| Companies / Branches | ● | ● | A |
| Employees | ● | ● | A |
| **Addresses** | ✗ column on `employees` | ● | **Port from B** |
| Stops | ● | ✗ | A |
| Vehicles / Drivers | ● | ● | A (+ B's extra columns) |
| Driver / Employee Shifts | ● | ● + global `shifts` | **Port B's `shifts`** |
| Routes / Route Stops | ● | ● | A |
| Trips | ● | ● | A |
| **Trip Assignments** | ✗ columns on `trips` | ● | **Port from B** |
| Bookings | ● | ● | A (+ B's OTP/recurrence columns) |
| Passenger Boarding Records | ● | ● | A |
| GPS Tracking Events | ● | ● | A |
| Maintenance / Payments / Invoices | ● | ● | A (+ `invoice_lines`) |
| Driver Earnings / Incidents / Notifications | ● | ● | A |
| Service Level Agreements | ● | ● | A |
| Audit Logs | ● **written** | ● **never written** | A |

**App A misses exactly 3 of the 27 required tables. All three exist in App B and are ported.**

---

## 2. Module-by-module status of App A (verified against source)

`●` implemented and persisted · `◐` partial · `✗` missing

### Module 1 — Authentication & user management
| Requirement | Status | Evidence |
| --- | :---: | --- |
| Registration / login | ● | `actions/auth.ts:15,44` |
| **Email and phone-based authentication** | ✗ | `auth.ts:16` reads `email` only; `generateOtp()` used only for 2FA |
| Password recovery | ● | `actions/auth.ts:93,116` |
| Role-based access control | ● | `lib/rbac.ts` + per-action `requirePermission` |
| Company accounts / multi-company | ● | `companies`, `companyId` scoping |
| Invitations & approval | ● | `admin.ts:502 inviteUserAction`, `users.status` |
| Profile management | ◐ | "My profile" card exists; **no change-own-password** |
| Activation / deactivation | ● | `admin.ts:533 updateUserStatusAction` |
| 2FA for privileged users | ● | `auth.ts:29-32`, seeded code `246810` |
| Complete audit logs | ● | `lib/auth.ts:131 logAudit` on every action |
| 8 named roles | ● | `rbac.ts` — all 8 present, exact names match |

### Module 2 — Corporate company management
| Requirement | Status | Evidence |
| --- | :---: | --- |
| Register clients / profiles | ● | `admin.ts:50,72` |
| Office locations & branches | ● | `admin.ts:92`, `company_branches` |
| Register employees | ● | `admin.ts:143` |
| **CSV import** | ● | `admin.ts:185 importEmployeesAction` |
| Employee work shifts | ● | `admin.ts:243,259` |
| Transportation contracts | ● | `service_agreements` |
| **Company-specific policies** | ◐ | free-text `companies.notes` only — no structured policy fields |
| SLAs & billing arrangements | ● | `service_agreements` + `billing_model` enum |
| Cost by company | ● | `queries.ts:157 getRevenueByCompany` |
| Individual corporate reports | ● | `reports/page.tsx` company filter |

### Module 3 — Booking & reservations
| Requirement | Status | Evidence |
| --- | :---: | --- |
| H→O and O→H booking | ● | `direction` enum, `ops.ts:600` |
| Daily/weekly/monthly recurrence | ● | `recurring_rule` enum on bookings |
| One-time requests | ● | `recurring = 'none'` |
| Pickup / drop-off selection | ● | `pickupAddress`, `pickupStopId` |
| Work shift selection | ● | `employees.shiftId` |
| Available schedules | ● | `trips` + `passenger/page.tsx` |
| Modify/cancel per policy | ● | `ops.ts:670 cancelOwnBookingAction`; policy = SLA `cancellationPolicyHours` |
| Confirmation display | ● | booking `reference` |
| Unique reference numbers | ● | `bookings.reference` |
| **Waiting lists** | ◐ | `waitlisted` status + *manual* promote (`bookings/page.tsx:158`); **no auto-promotion on seat release** |
| Duplicate/conflict prevention | ● | `domain.ts:176 validateBooking` — tested |
| Auto-assign to eligible routes | ● | `ops.ts:256 planTripsAction` |
| Capacity & seat availability | ● | `domain.ts:212 canAssignToTrip` — tested |
| Notify on confirm/change | ◐ | one `notifications` insert (`ops.ts:55`); no fan-out to passengers |
| Personal transport history | ● | `passenger/trips/page.tsx` |

### Module 4 — Route planning
All ● — grouping, sequencing, capacity, vehicle recommendation, driver recommendation, ETA/EDT,
recalculation after cancellation, manual adjustment, overbooking prevention, VIP priority
(`bookings.vip`), shift-aware departure (`domain.ts:113`), VRP-ready `RoutePlan` type.
`◐` **minimise empty vehicle movement** — no empty-mile metric or rebalancing pass.

### Module 5 — Fleet
All ● — every named field present (`registrationNo`, `make`, `model`, `photoUrl`, `capacity`,
`vehicleType`, `fuelType`, `registrationExpiry`, `insuranceExpiry`, `roadworthinessExpiry`,
`ownership`, `assignedDriverId`, `odometerKm`, `avgKmPerLitre`, `status`), maintenance history,
availability blocking (`domain.ts:212`), expiry + maintenance notifications (`queries.ts:259,292`).
`◐` **fuel consumption** — only `avgKmPerLitre`; no fuel log table.

### Module 6 — Driver app
| Requirement | Status | Evidence |
| --- | :---: | --- |
| Login, assigned trips, schedules | ● | `driver/page.tsx` |
| Pickup/drop-off locations | ● | `driver/trip/[id]` |
| Open navigation directions | ◐ | text says "Configure a mapping provider key" — no actual maps link |
| Passenger list | ● | manifest list |
| Start/end journey | ● | `ops.ts:814 driverTripAction` |
| Available/unavailable | ● | `ops.ts:743 setAvailabilityAction` |
| Confirm boarding + **verify OTP** | ● | `ops.ts:755 confirmBoardingAction` |
| Record no-shows | ● | `ops.ts:794 markNoShowAction` |
| Breakdowns, delays, incidents | ● | `ops.ts:532,884` + `incident_type` enum |
| Completed journeys / trip history | ● | `driver/page.tsx` |
| **Offline queue + duplicate prevention** | ● | `api/driver/sync/route.ts` — dedupe check at :84 |

### Module 7 — Passenger app
| Requirement | Status | Evidence |
| --- | :---: | --- |
| Profile, saved addresses | ● | `ops.ts:723 updateHomeAddressAction` |
| Book transportation | ● | `ops.ts:600` |
| Upcoming trips, pickup time/location | ● | `passenger/page.tsx` |
| Assigned driver & vehicle details | ● | `passenger/page.tsx` |
| **Track vehicle location during active trip** | ✗ | **no `LiveMap` in the passenger app** — 0 matches |
| Estimated arrival time | ● | scheduled/actual times |
| **Pickup reminders, delay & cancellation alerts** | ✗ | no reminder job, no alert fan-out |
| Secure boarding OTP | ● | `bookings.otpCode` |
| Cancel/reschedule | ● | `ops.ts:670` |
| Trip history | ● | `passenger/trips/page.tsx` |
| Feedback, ratings, complaints | ● | `ops.ts:703 submitFeedbackAction`, `feedback` table |
| Company transport policies | ◐ | falls back to `companies.notes` |
| Simple for non-technical users | ◐ | functional but dense |

### Module 8 — Dispatch dashboard
● for live map, active vehicles/trips, driver availability, booking status, delayed trips,
scheduled departures, pending bookings, utilisation, alerts, incident notifications; assign/reassign
vehicle + driver, modify schedules, move bookings between routes, breakdown response, monitor
journeys, permission-scoped contact info, on-time/delayed/cancelled/completed indicators.
`◐` **send trip notifications** — single insert, no targeted fan-out.
`◐` **create emergency trips** — `direction='ad_hoc'` exists, no dedicated emergency flow.

### Module 9 — Real-time GPS
| Requirement | Status | Evidence |
| --- | :---: | --- |
| GPS coordinates, live markers, route viz | ● | `components/live-map.tsx` + `api/dispatch/live` |
| ETA, scheduled vs actual | ● | `trips.scheduledArrival` / `actualArrival` |
| **Pickup/drop-off geofencing** | ✗ | 0 matches for geofence / radius / near |
| Movement history | ● | `gps_events` |
| **Automatic trip status updates** | ✗ | status set manually by driver |
| **Notifications for significant delays** | ✗ | |
| Consent + limited collection period | ✗ | no consent column, `retentionDate()` defined but never called |
| Configurable mapping provider | ● | `NEXT_PUBLIC_MAP_PROVIDER` |

### Module 10 — Billing, invoicing, payroll
| Requirement | Status | Evidence |
| --- | :---: | --- |
| 4 pricing models | ● | `domain.ts:252 computeCharge` |
| **Extra-trip / waiting / overtime charges** | ✗ | **real bug** — `computeCharge` accepts `waitingMinutes` and `overtimeMinutes` but the `switch` **ignores both**. Dead parameters. |
| Discounts and adjustments | ● | `invoices.discount` |
| **Monthly automated invoice generation** | ✗ | manual `admin.ts:547` only — no scheduler |
| Payment tracking, outstanding balances | ● | `payments`, `invoices.amountPaid` |
| Financial summaries | ● | `finance/page.tsx` |
| Driver earnings, allowances, overtime | ● | `domain.ts:279 computeDriverPay` — tested |
| Payroll export | ● | `api/reports/export` |
| GHS + multicurrency-ready | ● | `currency` column |
| Provider interfaces, clearly-labelled demo | ● | `payment_method` enum incl. paystack/flutterwave/mobile_money |

### Module 11 — Safety & compliance
● for driver licence tracking, insurance/document tracking, incident reporting, emergency contacts,
SOS, accident reports, breakdowns, driver performance, expiry reminders, permission-controlled
incidents, audit trails.
`◐` **safety inspection records** — `maintenance_records.type='inspection'` exists and one row is
seeded, but there is no inspection workflow, next-due date, or pass/fail outcome.

### Module 12 — Reporting & BI
● for total companies/employees/bookings/completed journeys/active vehicles, fleet utilisation,
driver performance, on-time %, cost per passenger, revenue per company, route efficiency,
maintenance costs, incident counts (`queries.ts:77-109`).
`◐` **total cancelled bookings**, **operational expenses** — partial.
`◐` **filters for company, date, route, driver, vehicle** — only `from`/`to`/`company` implemented
(`reports/page.tsx:19`).
`✗` **PDF export** — CSV only (`export/route.ts:28-153`); PDF only via browser print.

### §6 / §9 — Non-functional
| Requirement | Status | Evidence |
| --- | :---: | --- |
| HTTPS / secure auth / input validation | ◐ | auth solid; **no zod on the 39 actions** |
| Prevent duplicate bookings, invalid assignment, double billing, inconsistent state | ● | domain layer, all tested |
| Efficient queries, **pagination**, indexing, caching | ◐ | 34 indexes ●; **no pagination** (fixed `.limit()` caps); no cache |
| Scalable GPS handling | ◐ | unbounded `gps_events` growth, no retention job |
| **Configurable retention** | ✗ | `domain.ts:301 retentionDate()` defined, never used |
| Monitoring, backups, DR, SLOs | ✗ | no scripts, no monitoring config |
| Multi-client scale | ● | 34 indexes, `companyId` on every hot path |
| **Automated tests** for booking / capacity / role permissions / trip status / billing | ◐ | 15 tests cover booking, capacity, trip status, billing, routing. **Role permissions are NOT tested.** |

### §6 — Technology stack
| Requirement | Status | Notes |
| --- | :---: | --- |
| Next.js / React / TS / Tailwind | ● | Next 16.2.6, React 19.2.6, Tailwind 4.1.17 |
| Node + TS backend, secure REST APIs, server-side validation | ◐ | 5 routes only; validation missing |
| **Background job processing** | ✗ | App B already depends on `inngest` |
| PostgreSQL + "Prisma or an equivalent reliable ORM" | ● | Drizzle — documented as an equivalent substitution |
| Secure managed auth + RBAC | ● | self-hosted scrypt + DB sessions — documented substitution |
| **WebSockets or managed realtime** | ◐ | 15s REST polling — documented substitution; SSE is the right upgrade |
| Google Maps / Mapbox, configurable | ● | env-driven, with in-app vector fallback |
| Capacity-aware routing heuristics | ● | `domain.ts:48 planRoute` |
| **Installable PWA for passengers and drivers** | ✗ | no `manifest.json`, no service worker — despite the README calling it "PWA-ready" |
| Container-ready, env config | ◐ | env config ●; no Dockerfile |
| **CI/CD** | ✗ | no `.github/workflows` |
| Automated DB migration | ● | `drizzle.config.json` + `drizzle-kit push` |
| Logging and monitoring | ◐ | audit logs ●; no app logging/monitoring |
| **Secure backup and recovery** | ✗ | documented in OPERATIONS.md only |

### §11 — Deliverables
| # | Deliverable | Status |
| --- | --- | :---: |
| 1 | Folder structure | ● |
| 2 | Working frontends | ● (weak UI) |
| 3 | Backend services & API endpoints | ◐ (5 routes) |
| 4 | PostgreSQL schema & migrations | ● |
| 5 | Auth & authorization | ● |
| 6 | Booking & trip workflows | ● |
| 7 | Responsive admin/passenger/driver dashboards | ● |
| 8 | Seed data | ● |
| 9 | Env config examples | ● |
| 10 | Automated tests | ● (15) |
| 11 | Setup & deployment instructions | ● |
| 12 | API documentation | ● `docs/API.md` |
| 13 | **Architecture & database diagrams** | ✗ text only — needs Mermaid ERD + architecture diagram |
| 14 | Operational SOPs | ● `docs/OPERATIONS.md` |
| 15 | Phased roadmap w/ dependencies, effort, resources | ● `OPERATIONS.md §4` |
| 16 | **Feature checklist (implemented / partial / pending)** | ✗ |

---

## 3. The gap list — 30 items, in build order

### Tier 0 — Foundation (do before any UI work)
| # | Item | Type |
| --- | --- | --- |
| T0.1 | Extract App A into the repo root; wire deps; add PGlite fallback so it boots without a Postgres server | infra |
| T0.2 | **zod** validation on all 39 server actions | security |
| T0.3 | Hash the password-reset token before storing | security |
| T0.4 | Fail fast on a missing session secret; rotate the seeded 2FA code | security |
| T0.5 | Rate-limit `loginAction` + `requestPasswordResetAction` | security |
| T0.6 | Add a `sessions` kill-switch (sign out everywhere) | security |
| T0.7 | Add the 3 missing required tables + backfill migrations | schema |

### Tier 1 — Schema ports from App B
| # | Item |
| --- | --- |
| T1.1 | `roles`, `permissions`, `role_permissions`, `user_roles` — seed from the existing TS matrix so there is one source of truth |
| T1.2 | `shifts` (global) + `employee_shifts` + `driver_shifts` |
| T1.3 | `addresses` — normalise `employees.homeAddress`/`homeLat`/`homeLng` |
| T1.4 | `trip_assignments` — decouple trip↔vehicle/driver, backfill one row per trip |
| T1.5 | Port the richer enums + missing columns (`standingCapacity`, `chassisNumber`, `nextServiceDueDate`, `currentMileage`, `otpVerified`, `otpExpiresAt`, `currentOccupancy`, `totalTrips`, …) |
| T1.6 | Expand the REST API from 5 → ~18 routes, on App A's authorized + audited guards |

### Tier 2 — Prompt gaps closed
| # | Item | Module |
| --- | --- | --- |
| T2.1 | Phone OTP authentication alongside email | M1 |
| T2.2 | Structured company transport policies (cancel window, deviation, zones, night surcharge) | M2 |
| T2.3 | Automatic waitlist promotion on seat release | M3 |
| T2.4 | Notification fan-out to passengers on confirm/change/delay/cancel | M3/M8 |
| T2.5 | Fuel log table + fuel consumption tracking | M5 |
| T2.6 | Actual maps link for driver navigation (demo-mapped) | M6 |
| T2.7 | Passenger live vehicle tracking (reuse `LiveMap`) | M7 |
| T2.8 | Pickup reminders | M7 |
| T2.9 | Emergency / ad-hoc trip flow in dispatch | M8 |
| T2.10 | Geofencing engine for pickup & drop-off | M9 |
| T2.11 | Auto trip status derivation from the GPS feed | M9 |
| T2.12 | Delay-threshold notifications | M9 |
| T2.13 | Location consent flag + retention purge job | M9/§9 |
| T2.14 | Fix `computeCharge` — apply waiting & overtime charges | M10 |
| T2.15 | Scheduled monthly invoice generation | M10 |
| T2.16 | Background job runner | §6 |
| T2.17 | SSE realtime feed replacing polling | §6 |
| T2.18 | Safety inspection records with outcome + next-due | M11 |
| T2.19 | Report filters: route, driver, vehicle | M12 |
| T2.20 | PDF export | M12 |
| T2.21 | Pagination on every list view | §9 |
| T2.22 | PWA manifest + service worker + offline shell | §6 |
| T2.23 | Dockerfile, CI workflow, migration-on-deploy | §6 |
| T2.24 | Mermaid ERD + architecture diagram | §11.13 |
| T2.25 | `docs/FEATURE-CHECKLIST.md` (implemented / partial / pending) | §11.16 |
| T2.26 | Role-permission unit tests | §9 |
| T2.27 | Change-own-password + profile editing | M1 |
| T2.28 | Operational expense tracking (fuel + tolls + maintenance) | M12 |
| T2.29 | Caching for hot read paths | §9 |
| T2.30 | Calendar-based trip scheduling view | §7 |

### Tier 3 — UI rebuild (the parallel track)
Everything in [`../DESIGN.md`](../DESIGN.md). The prompt's §7 palette — "Navy blue, white, and
subtle teal accents" — **is** App A's current palette and **is** the generic brief. The user's
standing instruction ("modern, no generic AI stuff") supersedes it. Every *functional* §7
requirement is kept: sidebar navigation, interactive data tables, search and advanced filters,
visual KPI cards, interactive maps, calendar scheduling, status indicators, accessible buttons and
forms, user-friendly errors, and dark mode as a first-class theme.

---

## 4. Summary of the decision

- **Base:** App A. It satisfies 100% of the prompt's Module 1, 4, 5, 6, 10, 11 and 12 requirements
  at ● or ◐, and it is the only app with a working audit trail, a testable domain layer and
  persisted, authorised mutations.
- **Port:** 6 schema items from App B (§1) + the dependency set. App B's schema is literally the
  prompt's §5 list, so these are not optional — the spec demands them.
- **Build:** 30 new items (T0–T2) — roughly 60% new surface, 40% hardening of existing surface.
- **Rebuild:** the entire UI layer, per `DESIGN.md`.
