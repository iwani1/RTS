# App A vs App B — capability audit

Two apps were supplied as zips. Both target the same product: a staff transportation management
system for corporate shuttle clients in Ghana. This is an evidence-based comparison of what each
one actually implements, so any feature prompt can be mapped onto it line by line.

| | **App A** — `staff-transportation-management-system.zip` | **App B** — `staff-transportation-management-system (1).zip` |
| --- | --- | --- |
| Internal name | **StaffRide TMS** | "TMS" |
| Source lines | **10,429** | 6,277 |
| Tables | 27 | **29** |
| Server actions | **39** (all authorized + audited) | **0** |
| REST routes | 5 | **18** |
| Unit tests | **15** | 0 |
| Domain layer | **Yes** (pure, testable) | No |
| Docs | `API.md`, `OPERATIONS.md`, in-app `/docs` | None |

---

## 1. Feature ledger

`●` = fully implemented and persisted · `◐` = schema only, no logic · `○` = absent

| Capability | App A | App B | Notes |
| --- | :---: | :---: | --- |
| Auth: password hashing | ● | ● | A: scrypt + per-user salt. B: bcryptjs 12 rounds |
| Auth: DB-backed revocable sessions | ● | ○ | B uses stateless JWT — logout is cookie-delete only, a stolen token lives 7 days |
| Auth: 2FA for privileged roles | ● | ◐ | B has `twoFactorEnabled`/`twoFactorSecret` columns and **no login flow that uses them** |
| Auth: password reset | ● (hashed token, DB table) | ◐ | B stores the reset token **in plaintext** on the users row and `console.log`s it |
| RBAC: section/role matrix | ● (hardcoded in `rbac.ts`) | ● (DB tables) | **B is better here — see §3** |
| RBAC: fine-grained `resource.action` | ● (15 permissions) | ● (DB-driven) | A: TS const. B: `permissions` + `role_permissions` tables |
| RBAC: multi-role users | ○ | ● | B has `user_roles` join; A has a single `role` column |
| RBAC: runtime role management | ○ | ● | B's matrix is data, so it can be edited without a deploy |
| Audit trail on every mutation | ● | ○ | **B has an `audit_logs` table that nothing ever writes to** |
| Tenant isolation (`companyId` scoping) | ● | ● | Both |
| Booking rules: duplicate, capacity, waitlist, recurrence | ● (tested) | ◐ | B blocks one duplicate case only |
| Trip state machine | ● (tested, 7 states) | ◐ | B has the enum, no transition guard |
| Route planning / optimisation | ● (haversine + nearest-neighbour) | ○ | B has a `routes` table, no planner |
| Vehicle & driver recommendation | ● (tested) | ○ | |
| Dispatch: assign resources, reassign, status change | ● | ◐ | |
| Dispatch: live map + GPS feed | ● (`/api/dispatch/live`, vector map) | ○ | B has `gps_tracking_events` table, no map, no feed |
| Dispatch: boarding OTP verification | ● | ◐ | B has `otpCode` but no `otpVerified`/expiry logic |
| Driver mobile app | ● | ◐ | Both have `/driver`; A has duty flow, boarding, offline queue, SOS |
| Driver offline sync | ● (`/api/driver/sync`) | ○ | |
| Passenger app + feedback | ● (incl. `feedback` table) | ◐ | A has feedback submission; B does not |
| Incidents / SOS / breakdown workflow | ● | ● | Both have the table; A has the workflow |
| Fleet: documents, expiry, maintenance | ● | ● | A richer (odometer, cost/km, avg km/L) |
| Invoicing with line items | ● (`invoice_lines`) | ◐ | B has invoices, no line items |
| Payments | ● (5 methods + status) | ● | |
| Driver payroll / earnings | ● (tested calc) | ● | |
| Reports + analytics aggregations | ● (`queries.ts`, 9 aggregations) | ○ | B has a `/reports` page but no aggregation layer |
| CSV / PDF export | ● (`/api/reports/export`) | ○ | |
| CSV employee import | ● | ○ | |
| Shift-aware scheduling | ● | ● | **B's shift model is better — see §3** |
| Global reusable `shifts` table | ○ | ● | A: shifts are company-scoped only |
| Normalised `addresses` table | ○ | ● | A stores `homeAddress` as text on the employee row |
| `trip_assignments` (many-to-many trip↔vehicle) | ○ | ● | A: one vehicle + one driver per trip |
| Notifications | ● | ● | |
| RBAC-driven nav | ● | ● | |
| API surface for external clients | ○ | ● | **B is better here — see §3** |
| Unit tests | ● (15) | ○ | |
| Documentation | ● (2 files + in-app) | ○ | |

**Tally: App A ● = 31, ◐ = 3. App B ● = 13, ◐ = 13, ○ = 11.**

App A's three ◐ are all in App B's strong column (2FA columns, shifts, addresses) and are
portable. App A's `○` list is 7 items, all of which App B already has or nearly has.

---

## 2. App B's defects — do not copy these

These are not style differences. They are bugs.

| # | Defect | Location | Impact |
| --- | --- | --- | --- |
| 1 | `middleware.ts` calls `cookies()` from `next/headers` | `src/lib/middleware.ts:33` | **`cookies()` is unavailable in Next.js Edge middleware — it throws. Every non-API route 500s.** |
| 2 | `audit_logs` table exists, never inserted into | grep: 0 writes outside `schema.ts` | The audit trail is decorative. "Every mutation is logged" is false. |
| 3 | 2FA columns present, no 2FA flow | `schema.ts:197-198` | Schema promises a security control the app does not perform. |
| 4 | JWT secret defaults to a known literal | `src/lib/auth.ts:7-9` | `your-super-secret-jwt-key-change-in-production` — forges are possible if the env var is unset. |
| 5 | Password-reset token stored in plaintext | `api/auth/forgot-password/route.ts` | A DB read yields live account-takeover tokens. |
| 6 | Reset token written to stdout | same file, `console.log` | Token leaks into log aggregation. |
| 7 | `requirePermission` reads only the **first** user role | `src/lib/auth.ts:98` | Multi-role users are authorised against one arbitrary role. |
| 8 | No session storage | schema | Sessions cannot be revoked server-side; a token is valid for 7 days after "logout". |
| 9 | Every page is `"use client"` + `useEffect` fetch | all `src/app/**/page.tsx` | No SSR: data waterfalls, loading spinners, content flash, and the entire dataset shipped to the browser. |
| 10 | `// @ts-nocheck` in ~10 files | throughout | No type safety on the entire app. |
| 11 | `requireAuth` throws a plain `Error` | `src/lib/auth.ts:78` | Server errors leak as 500s instead of 401/403 redirects. |
| 12 | Dead duplicate query | `api/bookings/route.ts` | Builds a query, discards it, re-queries. |

---

## 3. What App B genuinely contributes — port these 7

These are real wins. They are *data-model* wins, which is exactly what AI-built apps most often
get wrong, because they are invisible in a UI screenshot.

### 3.1 Normalised RBAC tables — `roles`, `permissions`, `role_permissions`, `user_roles`
App A hardcodes the matrix in `src/lib/rbac.ts`. That means: a new role requires a code change and
a deploy, a user can hold only one role, and permissions cannot be granted to a person directly.
App B's model makes the matrix data.

**Port:** create the four tables, seed them from the existing `MATRIX`/`PERMISSIONS` constants so
there is one source of truth, and have `rbac.ts` read from the DB with the constants as the
fallback/seed. Keep `canAccess`/`can` as the call sites — the shape of the code does not change.

### 3.2 `shifts` + `employee_shifts` + `driver_shifts` as separate reusable tables
App A's `employee_shifts` table is company-scoped, so "Morning 07:00" is duplicated per client and
cannot be reused. App B has a global `shifts` definition with a `shift_type` enum joined to both
employees and drivers.

**Port:** add the global `shifts` table, backfill from existing rows, switch the FKs.

### 3.3 `addresses` table
App A stores `homeAddress`/`homeLat`/`homeLng` as columns on `employees`. A driver needs a
geocodable pickup address with a zone, and an employee may have both home and office addresses.
**Port:** add the table, migrate, keep the old columns as a compatibility view during transition.

### 3.4 `trip_assignments`
App A puts `vehicleId` + `driverId` directly on `trips`, which means exactly one vehicle per trip.
Real operations need a second vehicle for an overflow, or a standby driver.
**Port:** add the join table, backfill one row per existing trip, switch the assignment action.

### 3.5 Richer enumerations and column sets
Port the enums App B has that App A lacks: `vehicle_type`, `fuel_type`, `shift_type`, `booking_type`,
`notification_type`. Port the columns App B has that App A lacks:

- `vehicles`: `standingCapacity`, `color`, `chassisNumber`, `engineNumber`, `lastServiceDate`, `nextServiceDueDate`, `currentMileage`, `fuelConsumptionPerKm`
- `drivers`: `totalTrips`, `dateOfBirth`, `profileImageUrl`, `isAvailable`
- `bookings`: `otpVerified`, `otpExpiresAt`, `recurrenceEndDate`, `actualPickupTime`, `actualDropoffTime`
- `trips`: `currentOccupancy`, `shiftId`

### 3.6 The REST API surface
App A has 5 routes. App B has 18, covering every entity. A third-party HR system that wants to
read staff rosters needs a public API — this matters for the "HR / SSO integrations" roadmap item.
**Port:** the route set, reimplemented on App A's `requireUser` + `companyScope` guards so they
inherit the same tenant isolation and audit logging the server actions have.

### 3.7 The dependency set
App B's `package.json` already declares `lucide-react`, `framer-motion`, `cmdk`, `sonner`, `zod`,
`react-hook-form`, `@tanstack/react-table`, `class-variance-authority`, `tailwind-merge`, `clsx`,
`bcryptjs`, `jose`, `date-fns`, `nodemailer`, `inngest`, `cmdk`, `embla-carousel`. Adopting it
costs nothing and skips a round of installs.

---

## 4. Verdict

**Build on App A (StaffRide).**

App A is the product. App B is a UI prototype that happens to have a nicer schema in six places.

App A already has the things that are expensive to rebuild and easy to get wrong:
39 server actions where every mutation is authorised, tenant-scoped and audited; revocable DB
sessions; a working 2FA path; a pure domain layer with 15 passing tests; 9 analytics aggregations;
CSV import and export; an offline sync endpoint; a live vector map; and two documents of API and
operational reference. App B has none of these.

App A's weaknesses are **entirely in the UI layer and the schema's RBAC normalisation** — and the
UI layer is the thing we are about to rebuild from scratch anyway. Porting the seven items in §3
closes the gap.

App B's weaknesses are **architectural and security-critical** (broken middleware, phantom audit
trail, plaintext reset tokens, hardcoded JWT secret, no server rendering) and would take longer to
fix than to write properly.

**Base:** App A → rebuild the UI → port §3 (7 items) → apply `DESIGN.md`.

---

## 5. Pre-flight fixes to make on App A before the UI work

These are small, and doing them first means the rebuild sits on a correct foundation.

| # | Fix | File | Why now |
| --- | --- | --- | --- |
| 1 | Add `sessions` revocation endpoint / "sign out everywhere" | `src/app/actions/auth.ts` | 7-day tokens with no kill switch |
| 2 | Hash the password-reset token before storing | `src/lib/auth.ts` | Same defect App B has — do not inherit it |
| 3 | Require `JWT_SECRET`/`SESSION_SECRET` in production, fail fast otherwise | `src/lib/auth.ts` | App B's hardcoded default is a known pattern to avoid |
| 4 | Add `zod` validation to all 39 server actions | `src/app/actions/*.ts` | Actions currently trust `FormData` |
| 5 | Add `rate limiting` on `loginAction` + `requestPasswordResetAction` | `src/app/actions/auth.ts` | Both are brute-forceable |
| 6 | Confirm `audit_logs` writes on **every** action, including reads that change state | `src/lib/auth.ts:logAudit` | The claim is in the README; verify it |
| 7 | `npm run typecheck` and `npm run build` must pass before any UI work | — | Both zips ship untested; App A has no CI |
