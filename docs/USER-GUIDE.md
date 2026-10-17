# RTS — Guide by role

> Richie Transport Services Management System (RTS). A guide to the system **by role**: what each
> of the six roles sees, what it is responsible for, and the words the system uses.

## Start here: the 60-second orientation

**One system, two front doors.** The same application serves two audiences, and your role decides
which door you walk through:

| Front door | Who uses it | What it is for |
| --- | --- | --- |
| The operations console | Super Administrator, Operations Manager, Dispatcher, Fleet Manager, Finance Officer | Running the service: planning, dispatching, billing, governing |
| The driver app | Driver | Today's duty, boarding, position |

**The counts below are sidebar entries**, read out of the running application. Each role's list ends
with the same *Documentation* link.

**The one rule that explains the whole system:** *you only see what your role allows, and a
corporate client only ever sees their own company.* That is enforced on the server, not hidden in
the menu — a role that cannot reach a screen gets a refusal even if it types the address. The
sidebar is therefore a truthful picture of your job, not a subset of a bigger product.

**Two shortcuts worth learning on day one:**

- **⌘K** (or Ctrl+K) opens the command palette. It searches every screen *and* the live data —
  trips, bookings, vehicles, drivers, employees — and it only offers results you are allowed to
  see.
- **The top bar** carries the breadcrumb, the live trip ticker, the theme switch and your
  notifications. On the wide screen the rail on the left collapses to icons.

> **Retired for now.** The Employee/Passenger role and the Corporate HR role have been switched
> off. Their logins are refused, their screens are gone, and their data — clients, branches, the
> staff register, trips, bookings and invoices — is untouched, so either can be brought back with a
> change to the permission matrix.

---

## What do I want to do? Find it here

| If you want to… | Go to | Sign in as |
| --- | --- | --- |
| See whether the morning run is on time | **Live Dispatch** | Dispatcher |
| Assign a driver and a vehicle to a trip | **Live Dispatch** → open a trip | Dispatcher |
| Approve a passenger's ride request | **Bookings** | Dispatcher |
| Add a new employee to a client | **Employees** | Operations Manager |
| Set up a client and their contract | **Corporate Clients** | Operations Manager, Super Admin |
| Plan the route for a corridor | **Routes & Stops** | Operations Manager, Dispatcher |
| Work out the best vehicle order | **Route Optimisation** | Operations Manager, Dispatcher |
| Check a vehicle is roadworthy | **Compliance** | Fleet Manager |
| Log fuel | **Compliance** | Fleet Manager, Operations Manager |
| Record a breakdown or an accident | **Safety & Incidents** | Dispatcher, Fleet Manager |
| Raise this month's invoice | **Billing & Payroll** | Finance Officer |
| Change an exchange rate | **Currencies** | Finance Officer |
| Produce a report or a PDF | **Reports** | Finance Officer, Operations Manager |
| See who changed what | **Audit Trail** | Super Administrator only |
| Add or suspend a user | **Settings & Users** | Super Administrator, Operations Manager |
| Run a scheduled job by hand | **Operations** | Operations Manager, Super Admin |
| Start my journey, board a passenger | **Driver App** | Driver |

---

## The role walkthroughs

### Super Administrator — `admin@richietransportgh.com` · 2FA code `246810`

Lands on **Dashboard**. Twenty sidebar entries — the only role that sees all of them.

*You are responsible for:* the platform itself — who can use it, what the service agreements say,
and being able to prove what happened.

- **Settings & Users** — the user register. Every account, its role, its client scope, whether 2FA
  is on, when it last signed in. You can suspend an account or sign it out everywhere.
- **Audit Trail** — every recorded change, who made it and when. Only your role reaches it.
- **Corporate Clients** — clients, their branches, their service agreements and SLAs.
- **Currencies** — the exchange rates used for multi-currency billing.
- **Operations** — the scheduled jobs, their last run, the request metrics and the backups.
- **Everything else** — you can do what Operations Manager, Dispatcher, Fleet Manager and Finance
  Officer do, because your role is a superset.

*Your daily use is small:* check the dashboard, approve new accounts, and look at the audit trail
when someone asks a question about who did what.

---

### Operations Manager — `ops@richietransportgh.com`

Lands on **Dashboard**. Seventeen sidebar entries. The broadest operational role.

*You are responsible for:* the service as a whole — the clients, the people, the routes, the fleet
and the money, and the plan for tomorrow.

- **Corporate Clients** — onboard a client, add a branch, agree a service agreement.
- **Employees** — the staff register for every client. CSV import for a bulk upload. This is the
  screen that took over from the client's own HR team.
- **Routes & Stops** and **Route Optimisation** — the corridors and the solver that orders the
  stops for you.
- **Compliance** — vehicle readiness across the fleet.
- **Operations** — run a job now (the waitlist promotion, the invoice run, the purge), read the
  metrics, take a backup.
- **Everything except** Audit Trail, Currencies and the Finance screens, which belong to Finance
  and the Administrator.

*Your daily use:* plan tomorrow's trips, keep the staff register current, check the fleet is
compliant, keep the client contracts current.

---

### Dispatcher — `dispatch@richietransportgh.com`

Lands on **Dashboard**. **Ten sidebar entries — the most focused role in the system, and the one to
start with if the system feels big.**

*You are responsible for:* the live operation. The vehicles on the road, right now.

- **Live Dispatch** — the command centre. Three panes: the trip board on the left, the live map in
  the middle, the inspector drawer on the right. It refreshes every 15 seconds. This is where you
  spend your shift.
- **Trips** → open a trip to assign a driver and a vehicle, or move a passenger between trips.
- **Bookings** — approve, reject, and move waitlisted passengers onto a trip. There is an
  *Approve all eligible requests* button for the morning rush. This is where the ride requests the
  client's HR team used to raise now land.
- **Schedule** — the month and week calendar of trips and shifts.
- **Safety & Incidents** — log a breakdown, an accident or an SOS.

*Your daily use:*
1. Open **Live Dispatch**. The trip board lists the day's runs; colour tells you the state.
2. Click a trip. The inspector shows its route, its manifest and its current position.
3. **Assign** the driver and the vehicle if they are not set.
4. Watch the ETD deviation in the top strip. A red deviation means the run is behind.
5. When a trip is in trouble, open it and **Report delay** or log an incident.

*You do not need to visit* Fleet, Drivers, Employees, Corporate Clients, Finance, Reports,
Currencies, Audit Trail or Operations. They are not your job.

---

### Fleet Manager — `fleet@richietransportgh.com`

Lands on **Dashboard**. **Seven sidebar entries.**

*You are responsible for:* the vehicles and the people who drive them.

- **Fleet** — the vehicle register: registration, make and model, odometer, fuel type, ownership,
  status (`available`, `assigned`, `on_trip`, `under_maintenance`, `out_of_service`). You change
  the status, update the odometer and log a fuel entry from this screen.
- **Drivers** — the driver register: licence number and class, expiry, assigned vehicle, trip
  count, incident count, rating and earnings. A driver with no portal account shows *no portal
  account* — you can still run them; they simply have no login.
- **Compliance** — safety inspections and their recurrence, fuel logs, vehicle readiness. The
  inspection cycle schedules the next one automatically.
- **Safety & Incidents** — breakdowns and accidents involving your vehicles.

*Your daily use:* check which vehicles are `under_maintenance` or `out_of_service` before the
shifts are assigned, log yesterday's fuel, keep the inspection dates current.

---

### Finance Officer — `finance@richietransportgh.com`

Lands on **Dashboard**. **Seven sidebar entries.**

*You are responsible for:* what the service cost and what it earned.

- **Billing & Payroll** — the invoice register, payments, and driver earnings. Invoices are raised
  automatically on each client's billing day by a scheduled job; you review and mark them paid.
- **Reports** — performance analytics, and the export to CSV or PDF.
- **Currencies** — the exchange rates, for clients billed outside the base currency.
- **Drivers** — read-only here, for the earnings figures.

*Your daily use:* review the invoices raised overnight, chase an overdue one, export the monthly
report.

---

### Driver — `driver.kwesi@richietransportgh.com`

Lands on **Driver App**. **Two sidebar entries.** The app is built for a phone in a vehicle, so it
is large-target, single-column and works offline.

- **Current duty** — today's trip, with **Start journey**, **Report delay** and **Complete
  journey**.
- **Share position** — the phone shares your position on its own while the trip is running. Fixes are
  queued in the device when there is no signal and replayed when the connection returns, so nothing is
  lost and nothing is recorded twice. This is what puts you on the dispatcher's map. The panel also
  shows when the office last heard from you.
- **Boarding** — verify a passenger's boarding code and mark them aboard.
- **My availability**, **My schedule**, **Earnings summary**.

*Your daily use:*
1. Open the app at the start of your shift. Confirm your duty.
2. **Start journey** when you set off.
3. **Share position** as you drive — the office sees you move.
4. At each stop, take the passenger's boarding code and mark them aboard.
5. **Complete journey** at the last stop.
6. If you are running late, **Report delay** — the dispatcher sees it immediately.

---

## How the roles hand over to each other

One morning run, seen from all sides. This is the fastest way to understand the system:

| Time | Who | What happens |
| --- | --- | --- |
| Previous week | Operations Manager | Adds joiners to **Employees**, sets shifts and pick-up zones, and agrees the client's service agreement. |
| Previous week | Operations Manager | Plans the corridor in **Routes & Stops**, runs **Route Optimisation** to order the stops. |
| The evening before | Dispatcher | Approves the ride requests in **Bookings**, moves waitlisted passengers onto trips, and confirms a driver and vehicle for each run. |
| 05:00 | Fleet Manager | Checks the vehicles are compliant and records the fuel. |
| 06:00 | Driver | **Start journey**, then **Share position** on the way in. |
| 06:15 | Dispatcher | Watches **Live Dispatch**. One bus is behind; opens the trip and reassigns. |
| 06:20 | Driver | At the first stop, takes a boarding code and marks the passenger aboard. |
| 09:00 | Dispatcher | Closes the trip; any incident is logged in **Safety & Incidents**. |
| Month end | Finance Officer | The invoice is raised automatically on the billing day, reviewed in **Billing & Payroll**, and the report is exported from **Reports**. |
| Any time | Super Administrator | **Audit Trail** answers "who did that, and when". |

---

## The words the system uses

| Word | What it means here |
| --- | --- |
| **Client** | A company that buys the transport service — Sikaman Financial Services, Accra Tech Hub Ltd, Volta Foods Manufacturing. The tenant boundary. |
| **Branch** | A site of a client. Staff are attached to a branch, and each branch has a location. |
| **Employee** | A member of a client's staff. The person being transported. |
| **Shift** | When an employee wants transport — a night shift of 20:00–05:00, say. Drives which runs they appear on. |
| **Route / Corridor** | An ordered list of pick-up and drop-off stops between two places. The unit of planning. |
| **Trip** | One vehicle doing one route on one date, at one time. The unit of operation. A trip has a driver, a vehicle, a manifest and a status. |
| **Booking** | A passenger's request to be on a trip. The unit of demand. It is *pending*, then *approved* — or *waitlisted* if the trip is full — then *assigned* to a trip. |
| **Manifest** | The list of passengers on a trip. |
| **Seat fill** | Booked seats against capacity. The headline efficiency number. |
| **Service agreement** | The contract with a client: what is billed, when, and the SLA. |
| **Duty** | A driver's assignment for a period — the driver-side view of a trip. |
| **Boarding code** | The code a passenger shows the driver. Proves the right person got on the right bus. |
| **Trip status** | `scheduled` → `dispatching` → `in_progress` → `completed`, with `delayed` and `breakdown` as exceptions and `cancelled` when a run is called off. |

---

## If something does not look right

| What you see | What it means | What to do |
| --- | --- | --- |
| A screen is missing from the sidebar | Your role does not have that capability. | Ask an Operations Manager, or check the *What do I want to do?* table above for the role that owns it. |
| A screen says "You do not have permission" | You reached a URL directly that your role cannot use. | Use the sidebar. The refusal is the server, not the menu. |
| The sign-in says "Too many failed attempts" | Five failed attempts in fifteen minutes. | Wait fifteen minutes, or an administrator can reset the account in **Settings & Users**. |
| The 2FA field asks for a code | The account is privileged. | `246810` for the seeded administrator. |
| The map is empty | The vehicles have not departed, or no driver has shared a position yet. | Only trips with a position appear. |
| The app shows stale data | The connection dropped. | The driver app queues and replays automatically. |
| A retired account cannot sign in | The Employee/Passenger and Corporate HR roles are switched off for now. | Use one of the six roles above. |

---

## Where to look next

| | |
| --- | --- |
| `npm run roles` | Prints, for every role, the screens, sections and actions it can reach — read straight from the permission matrix, with no server and no database |
| `npm run roles:check` | Fails if a role can reach a different number of screens than this guide claims |
| `docs/OPERATIONS.md` | The daily standard operating procedures, the runbook, and the deployment notes |
| `docs/API.md` | Every API route, with the permissions each one enforces |
| `docs/ARCHITECTURE.md` | How the pieces fit, with the database diagram |
| `docs/AUDIT.md` | The security audit, what was found and what was fixed |
| `docs/FEATURE-CHECKLIST.md` | Every feature, marked implemented, partial or pending |
| `/docs` in the app | The same documentation, in the browser |

To see the system from a different angle, sign out and sign in as another role. The best way to
understand the boundaries is to watch a screen disappear.
