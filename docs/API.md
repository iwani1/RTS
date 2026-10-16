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

### Error semantics

Every action returns a human readable `message`. Business rule violations use stable codes internally
(`E_DUPLICATE`, `E_CAPACITY`, `E_TRIP_CLOSED`, `E_DATE`, `E_SEATS`) and are surfaced as plain language in the UI.
Unauthorised calls throw and are caught by the framework boundary — no data is modified.
