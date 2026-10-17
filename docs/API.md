# API reference

All endpoints are served by the Next.js runtime. Authentication uses the `tms_session` HTTP-only cookie issued at
login. Authorisation is evaluated server side on every request/action.

## REST endpoints

### `GET /api/health`
Liveness + database connectivity probe.

```json
{ "status": "ok", "database": "connected", "time": "2026-03-02T08:00:00.000Z" }
```

### `POST /api/auth/logout`
Destroys the session and redirects (303) to `/login`.

### `POST /api/auth/login`
**Public.** Native sign-in endpoint. Accepts `application/x-www-form-urlencoded`
(the same encoding a browser uses for a plain HTML form), so authentication
works with JavaScript disabled.

| Field | Type | Notes |
| --- | --- | --- |
| `email` | string | Required, validated against the email schema. |
| `password` | string | Required. |
| `code` | string | Two-factor code. Required for privileged roles with 2FA enabled. |

On success the handler issues the `tms_session` cookie and redirects (307) to
the role's home route. On failure it redirects (303) to `/login?error=…`.

Rate limited by `assertLoginAllowed`; every attempt is written to
`login_attempts` and the audit log.

### `POST /api/auth/register`
**Public.** Creates a self-registered account. An email that already exists on
an employee record is activated immediately; anything else is created as
`pending` and needs administrator approval. Redirects (303) to
`/login?notice=…` on success, `/register?error=…` on failure.

### `POST /api/auth/forgot-password`
**Public.** Issues a single-use, one-hour reset token. The response is
neutral for an unknown address so the endpoint cannot be used to enumerate
accounts. With no mail provider configured, the token is handed straight back
to the user. Redirects (303) to `/reset-password?token=…&notice=…` or
`/forgot-password?notice=…`.

### `POST /api/auth/reset-password`
**Public.** Consumes a reset token and sets a new password. Every existing
session for that user is revoked. Redirects (303) to `/login?notice=…` on
success, `/reset-password?error=…&token=…` on failure (the token is preserved
so the user does not have to paste it again).

### `GET /api/dispatch/live`
**RBAC:** `dispatch` or `dashboard` sections (super admin, ops manager, dispatcher, fleet manager, finance officer,
corporate admin — the last one is scoped to its own client).

Returns the latest known position for every active duty plus a compact trip feed. No-store cached; the dispatch map
polls it every 15 seconds.

```json
{
  "updatedAt": "2026-03-02T05:41:10.000Z",
  "activeTrips": 6,
  "points": [
    { "id": "t12", "lat": 5.5821, "lng": -0.2134, "label": "GR-4521-24 · Sikaman Financial Services", "kind": "vehicle", "tone": "teal" }
  ],
  "trips": [
    {
      "id": 12,
      "reference": "TRP-8H2K1A",
      "status": "in_progress",
      "company": "Sikaman Financial Services",
      "vehicle": "GR-4521-24",
      "driver": "Kwesi Appiah",
      "bookedSeats": 13,
      "capacity": 14,
      "scheduledDeparture": "2026-03-02T05:30:00.000Z",
      "lastPosition": { "tripId": 12, "lat": 5.5821, "lng": -0.2134, "recordedAt": "2026-03-02T05:40:55.000Z" }
    }
  ]
}
```

### `POST /api/driver/sync`
**RBAC:** `driver` role only. Replays actions that the driver app queued while offline.

```json
{
  "items": [
    { "kind": "position", "tripId": 12, "lat": 5.5821, "lng": -0.2134, "speedKph": 31, "clientRef": "pos-001", "recordedAt": "2026-03-02T05:40:55.000Z" },
    { "kind": "boarding", "bookingId": 481, "otp": "123456", "clientRef": "brd-001" },
    { "kind": "no_show", "bookingId": 482, "clientRef": "nos-001", "note": "Passenger not present" }
  ]
}
```

Response:

```json
{ "accepted": 3, "results": [ { "clientRef": "pos-001", "ok": true, "message": "Position stored" } ] }
```

Duplicate prevention: `clientRef` is embedded in the `gps_events.source` column and a pre-existing boarding row for
`(booking_id, trip_id)` short-circuits a replay. Conflict handling: a boarding whose OTP no longer matches is rejected
with `ok: false`, and positions for a trip that is no longer assigned to the driver are refused.

### `GET /api/reports/export?type=operating|trips|bookings|payroll&from=YYYY-MM-DD&to=YYYY-MM-DD&company=ID`
**RBAC:** `reports` or `finance` sections; corporate admins are automatically scoped to their own client.
Returns `text/csv` with a `content-disposition` attachment header.

* `operating` — per day / per client: trips, completed, passengers, capacity, planned km, seat fill %
* `trips` — one row per trip with vehicle, driver, schedule vs actual
* `bookings` — one row per booking with employee, leg, status, cancellation reason
* `payroll` — one row per driver earnings entry (finance role only)

### `GET /api/reports/pdf?type=trips|manifest|invoice&from=YYYY-MM-DD&to=YYYY-MM-DD&company=ID&tripId=ID&id=ID`
**RBAC:** `reports` or `finance`; an invoice also requires `finance`. Corporate admins are scoped to their own client.
Returns `application/pdf` with a `content-disposition` attachment header.

The document is written server side by `src/lib/pdf.ts` — a small PDF writer with no dependencies — so the
client receives a file it can open, print and archive without a browser print dialog.

* `trips` — the trip register for the period, with vehicle, driver, seat load and status
* `manifest` — the passenger manifest for one trip: booking reference, name, staff code, department, status
* `invoice` — one invoice: its lines, subtotal, tax and total, in the invoice's own currency

### `GET /api/metrics`
**RBAC:** any signed-in user. Set `METRICS_PUBLIC=true` to open it to anonymous callers — only appropriate
behind a private network or an authenticating reverse proxy.
Returns the Prometheus text exposition format.

* `GET /api/metrics?format=json` returns the same data as a JSON snapshot: counters, latency percentiles
  and process uptime.

Metric families: `rts_uptime_seconds`, `rts_http_<method>_<route>_total` (request counters, keyed
by route shape so cardinality stays bounded), `rts_http_<method>_<route>_duration_ms` (p95, count, sum),
and one counter per named operation.

### `GET /api/jobs`
**RBAC:** the `operations` section.
Returns the registered job list with the last run of each job and the run history.

### `POST /api/views/save` and `POST /api/views/delete`
**RBAC:** any signed-in user; a view belongs to the user who saved it and cannot be read or deleted by anyone else.
Plain form posts — no JavaScript required.

| Field | Meaning |
| --- | --- |
| `scope` | the list the view belongs to, e.g. `trips` or `bookings` |
| `name` | the view name; re-saving the same name replaces the filters |
| `filter.<key>` | one filter value, repeated for each filter |
| `returnTo` | where the browser lands afterwards |

### `POST /api/auth/otp` and `POST /api/auth/otp/verify`
Phone OTP sign-in. `POST /api/auth/otp` takes a phone number and issues a six-digit code; the code is stored
hashed with scrypt with an expiry and an attempt counter, never in clear. `POST /api/auth/otp/verify` takes the
phone number and the code, and creates the session on success.

**Demo mode:** with no `SMS_PROVIDER_API_KEY` configured the message is not sent — the code is written to the
server log and the delivery is recorded as `simulated`. The screen says so.

### `GET /api/auth/oidc` and `GET /api/auth/oidc/callback`
OIDC authorization-code flow with PKCE against a configured issuer. The redirect URI, the state parameter and
the code verifier are all checked on the way back.

**Demo mode:** with no `OIDC_ISSUER` configured the SSO buttons are hidden and the flow is unavailable. The
client code is real; there is simply no issuer to talk to.

## Server actions

Server actions accept `FormData` and return `{ ok?: boolean; message?: string; data?: Record<string,string> }`.
They are invoked by the `<ActionForm>` / `<InlineActionForm>` client components which surface the outcome inline.

| Action | Permission | Effect |
| --- | --- | --- |
| `auth.loginAction` | public | verifies credentials + 2FA, creates session, writes audit log |
| `auth.registerAction` | public | creates account (auto-activated when the email matches an HR registered employee) |
| `auth.requestPasswordResetAction` / `resetPasswordAction` | public | tokenised password recovery |
| `admin.createCompanyAction` / `updateCompanyAction` | `company.manage` | register / amend a corporate client |
| `admin.createBranchAction` / `createAgreementAction` | `company.manage` | offices, SLAs, pricing model |
| `admin.createEmployeeAction` / `toggleEmployeeAction` / `assignEmployeeShiftAction` | `employee.manage` | employee lifecycle |
| `admin.importEmployeesAction` | `employee.manage` | CSV import with row-level validation |
| `admin.createShiftAction` | `employee.manage` | work shift template |
| `admin.createVehicleAction` / `updateVehicleAction` / `scheduleMaintenanceAction` | `vehicle.manage` | fleet lifecycle |
| `admin.createDriverAction` / `updateDriverAction` | `driver.manage` | driver + optional portal account |
| `admin.createStopAction` / `createRouteAction` / `toggleRouteAction` | `route.manage` | corridors and stop sequences |
| `admin.inviteUserAction` / `updateUserStatusAction` | `user.manage` | user administration |
| `admin.generateInvoiceAction` / `recordPaymentAction` / `approveEarningsAction` | `finance.manage` | billing & payroll |
| `ops.planTripsAction` | `trip.dispatch` | clustering + routing + vehicle/driver allocation |
| `ops.createTripAction` | `trip.manage` | manual / emergency duty |
| `ops.assignResourcesAction` | `trip.dispatch` | assign or reassign vehicle & driver (capacity guarded) |
| `ops.updateTripStatusAction` | `trip.dispatch` | state machine transitions, releases resources |
| `ops.recordPositionAction` | `trip.dispatch` | manual GPS entry (demo source) |
| `ops.decideBookingAction` | `booking.approve` | approve / waitlist / reject / cancel |
| `ops.moveBookingAction` | `trip.dispatch` | move a booking to another trip (capacity guarded) |
| `ops.createIncidentAction` / `updateIncidentAction` | `incident.report` / `incident.manage` | safety records |
| `ops.createBookingAction` / `cancelOwnBookingAction` / `submitFeedbackAction` / `updateHomeAddressAction` | `booking.own` | passenger self service |
| `ops.confirmBoardingAction` / `markNoShowAction` | driver or dispatch | OTP boarding verification |
| `ops.driverTripAction` | `driver.duty` | start / complete / delay a duty, accrues earnings |
| `ops.setAvailabilityAction` | `driver.duty` | availability toggle |
| `ops.markNotificationsReadAction` | any session | clears the notification badge |
| `auth.requestPhoneOtpAction` / `verifyPhoneOtpAction` | public | issue and verify a phone one-time code |
| `auth.enableTotpAction` / `confirmTotpAction` / `disableTotpAction` | any session | authenticator-app enrolment and removal |
| `platform.saveViewAction` / `deleteViewAction` | any session | the caller's own saved filter sets |
| `platform.recordFuelLogAction` | `vehicle.manage` | litres, cost, odometer and station for a vehicle |
| `platform.createSafetyInspectionAction` | `vehicle.manage` | an inspection result and the next due date |
| `platform.shareTripAction` / `revokeShareAction` | `booking.own` | a short-lived corridor share code, and its revocation |
| `platform.updateExchangeRateAction` | `finance.manage` | update a rate and the date it was observed |
| `platform.runJobAction` | `operations` | run one registered job on demand |

### Error semantics

Every action returns a human readable `message`. Business rule violations use stable codes internally
(`E_DUPLICATE`, `E_CAPACITY`, `E_TRIP_CLOSED`, `E_DATE`, `E_SEATS`) and are surfaced as plain language in the UI.
Unauthorised calls throw and are caught by the framework boundary — no data is modified.
