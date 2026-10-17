/**
 * The client-facing guide: "How your people will use StaffRide".
 *
 * A pitch document, not a manual. It answers the question the owner of a
 * company actually asks — who touches the system, what they do, and what
 * the company gets out of it — in one readable document.
 *
 *   node --experimental-strip-types scripts/make-user-guide-pdf.mts
 *
 * The output is written to docs/StaffRide-User-Guide.pdf.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPdf, type PdfBlock } from "../src/lib/pdf.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/StaffRide-User-Guide.pdf");

const blocks: PdfBlock[] = [
  /* ------------------------------------------------------------------ */
  { type: "heading", text: "What the system does", level: 1 },
  {
    type: "lead",
    text:
      "StaffRide runs the company shuttle service: one platform for planning routes, " +
      "dispatching vehicles, carrying staff safely, and billing every client correctly. " +
      "Four interfaces, one database, one set of rules.",
  },
  {
    type: "cards",
    items: [
      {
        title: "Operations console",
        text:
          "Where the service is run: the dispatch command centre, the trip board, the live map, " +
          "the roster, the vehicles, the money. Six of the eight roles work here.",
      },
      {
        title: "Passenger app",
        text:
          "What staff use on their phone: request a ride, see which bus is coming, get a boarding " +
          "code, check their own trips and their own invoice.",
      },
      {
        title: "Driver app",
        text:
          "What the driver uses in the vehicle: today's duty, the manifest, share position, " +
          "board a passenger, report a problem. Built for a phone on a dashboard.",
      },
      {
        title: "Client portal",
        text:
          "What the client's own HR team uses: its staff, its shifts, its ride requests and its " +
          "bill. It never sees another company, enforced on the server.",
      },
    ],
  },
  {
    type: "callout",
    title: "The one rule that explains the system",
    text:
      "You only see what your role allows, and a corporate client only ever sees its own " +
      "company. That is enforced by the server, not hidden in the menu — a role that cannot reach " +
      "a screen is refused even if it types the address. The navigation is therefore a truthful " +
      "picture of the job, not a smaller version of a bigger product.",
  },
  {
    type: "paragraph",
    text:
      "Nothing in the service depends on a phone call or a spreadsheet. A request becomes a " +
      "booking, a booking becomes a trip, a trip becomes a manifest, and a manifest becomes an " +
      "invoice line. Every step is recorded, so the company can always answer who was carried, " +
      "by which vehicle, under which agreement, and at what price.",
  },

  /* ------------------------------------------------------------------ */
  { type: "pagebreak" },
  { type: "heading", text: "The eight roles and what each one owns", level: 1 },
  {
    type: "lead",
    text:
      "The same code serves eight roles. Each one opens the system on the screens that are " +
      "actually their work — nothing more, nothing less.",
  },
  {
    type: "table",
    columns: [
      { label: "Role", width: 1.5 },
      { label: "What they are responsible for", width: 2.6 },
      { label: "The screens they get", width: 2.4 },
    ],
    rows: [
      [
        "Super Administrator\n(20 screens)",
        "The platform itself: who can use it, what the service agreements say, and the evidence of who did what.",
        "Everything, including the audit trail, the user register, currencies and scheduled jobs.",
      ],
      [
        "Operations Manager\n(17)",
        "The service: corridors, client contracts, the plan, and the scheduled work that keeps it running.",
        "Routes and stops, route optimisation, employees, corporate clients, fleet, drivers, compliance, operations.",
      ],
      [
        "Dispatcher\n(10)",
        "The day: approving ride requests, assigning a driver and a vehicle, and watching the live board.",
        "Live dispatch, trips, bookings, schedule, routes, safety and incidents.",
      ],
      [
        "Fleet Manager\n(7)",
        "The vehicles: roadworthiness, fuel, maintenance and the incidents that take a bus off the road.",
        "Fleet, drivers, compliance, safety and incidents.",
      ],
      [
        "Finance Officer\n(7)",
        "The money: invoices, payroll, exchange rates and the reports the company is measured on.",
        "Billing and payroll, reports, currencies, drivers for the cost base.",
      ],
      [
        "Corporate HR\n(12)",
        "The client's own staff, and only its own staff: joiners, shifts, ride requests and the bill.",
        "Employees, bookings, trips, routes, its own billing and reports.",
      ],
      [
        "Employee / Passenger\n(2)",
        "Their own commute: request a ride, track it, board with a code.",
        "My transport, and the live corridor.",
      ],
      [
        "Driver\n(2)",
        "Today's duty: start the journey, share the position, board the passenger, close the trip.",
        "The driver app, and the boarding list.",
      ],
    ],
    note:
      "The screen counts are read out of the running application, not typed by hand: a check in " +
      "the build fails if a role can reach a different number of screens than this document says.",
  },
  {
    type: "callout",
    title: "For the owner",
    text:
      "You do not need to learn eight systems. You need one screen for the morning — the " +
      "dashboard — and one report at the end of the month. Everything else in between belongs to " +
      "the operations team and runs without you.",
  },

  /* ------------------------------------------------------------------ */
  { type: "pagebreak" },
  { type: "heading", text: "A day in the life of one shuttle run", level: 1 },
  {
    type: "lead",
    text:
      "This is the whole service in one table. It is how the roles hand over to each other, and " +
      "how a passenger's journey is actually produced.",
  },
  {
    type: "table",
    columns: [
      { label: "When", width: 1.1 },
      { label: "Who", width: 1.5 },
      { label: "What happens", width: 3.6 },
    ],
    rows: [
      ["Previous week", "Corporate HR", "Adds joiners to the employee register, sets their shifts and pick-up zones. Sends a list for bulk upload."],
      ["Previous week", "Operations Manager", "Plans the corridor, runs route optimisation to order the stops, and agrees the client's service agreement."],
      ["Evening before", "Dispatcher", "Approves the ride requests, moves waitlisted passengers onto trips, confirms a driver and a vehicle for every run."],
      ["05:00", "Fleet Manager", "Confirms the vehicles are compliant and records the fuel."],
      ["06:00", "Driver", "Starts the journey and shares the position on the way in."],
      ["06:15", "Dispatcher", "Watches the live board. One bus is behind — the trip is opened and reassigned."],
      ["06:20", "Driver", "At the first stop, takes the boarding code and marks the passenger aboard."],
      ["06:30", "Passenger", "Sees the vehicle on the live corridor and shows the boarding code."],
      ["09:00", "Dispatcher", "Closes the trip. Anything that went wrong is logged as a safety incident."],
      ["Month end", "Finance Officer", "The invoice is raised automatically on the billing day, reviewed, and the report is exported."],
      ["Any time", "Super Administrator", "The audit trail answers: who did that, and when."],
    ],
  },
  {
    type: "callout",
    title: "Why this matters commercially",
    text:
      "Every handover above leaves a record. If a passenger complains, if a vehicle breaks down, " +
      "or if a client disputes an invoice, the answer is a timestamped trail rather than a memory.",
  },

  /* ------------------------------------------------------------------ */
  { type: "pagebreak" },
  { type: "heading", text: "What people actually do, and where", level: 1 },
  {
    type: "lead",
    text: "The tasks that come up every day, and the role that owns each one.",
  },
  {
    type: "table",
    columns: [
      { label: "To do this", width: 2.6 },
      { label: "The screen", width: 1.8 },
      { label: "Owned by", width: 1.7 },
    ],
    rows: [
      ["See whether the morning run is on time", "Live Dispatch", "Dispatcher"],
      ["Assign a driver and a vehicle to a trip", "Live Dispatch → the trip", "Dispatcher"],
      ["Approve a passenger's ride request", "Bookings", "Dispatcher, Corporate HR"],
      ["Add a new employee to a client", "Employees", "Corporate HR, Operations"],
      ["Set up a client and its contract", "Corporate Clients", "Operations, Admin"],
      ["Plan the route for a corridor", "Routes & Stops", "Operations, Dispatcher"],
      ["Choose the best order for the stops", "Route Optimisation", "Operations, Dispatcher"],
      ["Check a vehicle is roadworthy, log fuel", "Compliance", "Fleet Manager"],
      ["Record a breakdown or an accident", "Safety & Incidents", "Dispatcher, Fleet"],
      ["Raise this month's invoice", "Billing & Payroll", "Finance Officer"],
      ["Change an exchange rate", "Currencies", "Finance Officer"],
      ["Produce a report or a PDF", "Reports", "Finance, Operations"],
      ["See who changed what", "Audit Trail", "Super Administrator only"],
      ["Add or suspend a user", "Settings & Users", "Admin, Operations"],
      ["Book my own ride", "My Transport", "Employee"],
      ["Start my journey, board a passenger", "Driver App", "Driver"],
    ],
  },
  {
    type: "paragraph",
    text:
      "Two shortcuts make it fast on day one. The command palette (Ctrl+K or ⌘K) searches every " +
      "screen and the live data — trips, bookings, vehicles, drivers, employees — and only offers " +
      "results the signed-in role is allowed to see. And the top bar carries the live trip ticker, " +
      "the notifications and the theme switch, so the state of the service is always one glance away.",
  },

  /* ------------------------------------------------------------------ */
  { type: "pagebreak" },
  { type: "heading", text: "The controls that protect the company", level: 1 },
  {
    type: "lead",
    text:
      "A transport operation is a liability operation. These are the controls that come with the " +
      "system rather than with extra work.",
  },
  {
    type: "cards",
    items: [
      {
        title: "Clients cannot see each other",
        text:
          "Every query is scoped on the server. A client portal account sees its own staff, its own " +
          "trips and its own invoice, and cannot reach another company by any route.",
      },
      {
        title: "Access is refused, not hidden",
        text:
          "A role that cannot use a screen is turned away by the server even if the address is " +
          "typed by hand. The menu is not a security control — the server is.",
      },
      {
        title: "Every change is recorded",
        text:
          "User accounts, contracts, rates, bookings, trips, incidents and invoices all leave an " +
          "audit trail with the person, the time and the detail.",
      },
      {
        title: "Boarding codes",
        text:
          "A passenger shows a code that only that booking carries. It proves the right person " +
          "boarded the right vehicle, and it settles the argument before it starts.",
      },
      {
        title: "Live position and alerts",
        text:
          "Vehicles report their position, trips are flagged delayed or broken down, and the " +
          "dispatcher sees it on the board and on the map without a phone call.",
      },
      {
        title: "Vehicle compliance and fuel",
        text:
          "Roadworthiness, inspections, fuel and incidents are recorded against the vehicle, so " +
          "the question \"is this bus fit to carry our staff?\" has an answer.",
      },
      {
        title: "Billing that reconciles",
        text:
          "Invoices are raised automatically on the agreed billing day from the trips actually " +
          "run, with the service agreement applied and the currency handled.",
      },
      {
        title: "Data that is looked after",
        text:
          "Sessions, one-time codes and sign-in attempts are purged on a schedule, positions are " +
          "aged out, and the database is backed up automatically and pruned.",
      },
    ],
  },
  {
    type: "callout",
    title: "Sign-in protection",
    text:
      "Passwords are stored as scrypt hashes, sessions are held as tokens in an httpOnly cookie, " +
      "five failed attempts lock an account for fifteen minutes, and privileged accounts need a " +
      "second factor. The test sign-in route used by the automated checks is closed unless it is " +
      "explicitly switched on.",
  },

  /* ------------------------------------------------------------------ */
  { type: "pagebreak" },
  { type: "heading", text: "What the company gets out of it", level: 1 },
  {
    type: "lead",
    text:
      "The reports are the point. These are the numbers the service can be run on and reported " +
      "on — every one of them comes out of the system rather than out of a notebook.",
  },
  {
    type: "table",
    columns: [
      { label: "The measure", width: 1.8 },
      { label: "The question it answers", width: 2.6 },
      { label: "Where it comes from", width: 1.8 },
    ],
    rows: [
      ["Seat fill", "Are the buses half empty?", "Bookings against capacity, per trip and per corridor"],
      ["On-time performance", "Are staff collected when they said they would be?", "Scheduled against actual departure, per route"],
      ["Passengers carried", "How many journeys did we actually make?", "Completed trips and their manifests"],
      ["Cost per passenger", "Is the shuttle cheaper than the alternatives?", "Invoices and payroll over passengers carried"],
      ["Usage by branch", "Which sites are heavy and which are light?", "Employees, shifts and trips by branch"],
      ["Vehicle utilisation", "Do we have the right number of buses?", "Trips and active time per vehicle"],
      ["Safety record", "Any incidents, and how were they handled?", "Safety and incident log with the action taken"],
      ["Spend per client", "What does each contract really cost to serve?", "Billing by company and by agreement"],
    ],
  },
  {
    type: "paragraph",
    text:
      "The monthly pack for the owner is one page: what was carried, what it cost, how the buses " +
      "performed, and anything that needs a decision. It is exported from Reports as a PDF or a " +
      "spreadsheet, and it is produced from the same records the service ran on.",
  },
  {
    type: "callout",
    title: "The commercial argument",
    text:
      "Consolidated staff transport is cheaper than a fuel allowance or a fleet of individual " +
      "vehicles, and it is the only version of the service that can be measured. The system makes " +
      "the saving visible instead of theoretical.",
  },

  /* ------------------------------------------------------------------ */
  { type: "pagebreak" },
  { type: "heading", text: "Questions the owner will ask", level: 1 },
  {
    type: "table",
    columns: [
      { label: "Question", width: 2.2 },
      { label: "Answer", width: 3.6 },
    ],
    rows: [
      ["A driver calls in sick at 5 a.m. — what happens?", "The dispatcher sees the unassigned trip on the board, assigns another driver and a vehicle, and the change is recorded. The passengers are notified through the app."],
      ["A passenger is late for the bus.", "The trip waits or departs per the corridor rule, and the manifest records who boarded. The boarding code is what settles it."],
      ["A new employee joins next Monday.", "HR adds them once in the employee register and sets their shift and pick-up zone. They appear on the right runs automatically from then on."],
      ["A client disputes an invoice.", "The invoice is raised from the trips that ran, under the agreed agreement. The dispatcher's bookings and the trip records show exactly what was carried."],
      ["Can our staff see other companies' data?", "No. The scope is enforced on every query on the server, not by hiding links. A portal account is bound to its own company."],
      ["What happens if the internet drops in the vehicle?", "The driver app queues the updates offline and replays them when the connection returns, without duplicating records."],
      ["Who can see the audit trail?", "The Super Administrator alone. It records every change with the person and the time, and cannot be edited by the people it watches."],
      ["Is the data ours?", "The client records belong to the client, are separated by tenant, and are exportable at any time."],
    ],
  },

  /* ------------------------------------------------------------------ */
  { type: "pagebreak" },
  { type: "heading", text: "How we start", level: 1 },
  {
    type: "lead",
    text:
      "Three stages. Each one ends with a number that proves the next stage is worth doing.",
  },
  {
    type: "numbers",
    items: [
      "Stage one — pilot (four weeks). Two branches, the routes they already run, the current drivers. The company sees the daily board, the first invoices and the first month-end pack. Exit measure: every trip in the pilot captured in the system, and the invoice reconciled against the old process.",
      "Stage two — rollout. Every branch and every shift on the system, HR adding staff through the portal instead of a spreadsheet, finance paying from generated invoices. Exit measure: one invoice run, one report, no parallel spreadsheets.",
      "Stage three — optimise. Route optimisation, seat-fill targets, vehicle utilisation, and a service-agreement review for each client. Exit measure: a cost per passenger that is measured, not estimated.",
    ],
  },
  {
    type: "callout",
    title: "What we need from you",
    text:
      "The staff register and the shifts for the first two branches, the current routes and their " +
      "times, the vehicles and their drivers, and the client agreements with the billing basis. " +
      "Everything else is already in the system.",
  },
  {
    type: "paragraph",
    text:
      "The platform runs on one server with an embedded database — no database server to install, " +
      "no cloud account to open. It is deployed as a container, it is backed up automatically, and " +
      "it can be operated by a single administrator with a browser.",
  },
  {
    type: "spacer", height: 8,
  },
  {
    type: "rule",
  },
  {
    type: "paragraph",
    text:
      "StaffRide — Enterprise Staff Transportation Management System. Eight roles, four " +
      "interfaces, 42 database tables, live dispatch, automated billing and a full audit trail. " +
      "This document describes how the system is used; the technical detail is in the project " +
      "documentation.",
  },
];

const pdf = buildPdf({
  title: "StaffRide — how your people will use the system",
  cover: {
    kicker: "StaffRide · Enterprise staff transportation management",
    title: "How your people will use StaffRide",
    subtitle:
      "Who touches the system, what they do on it, and what the company gets out of it — a " +
      "day-to-day guide for every role.",
    contents: [
      "What the system does",
      "The eight roles and what each one owns",
      "A day in the life of one shuttle run",
      "What people actually do, and where",
      "The controls that protect the company",
      "What the company gets out of it",
      "Questions the owner will ask",
      "How we start",
    ],
    preparedFor: "Prepared for the Managing Director",
    date: "October 2026",
  },
  blocks,
  footer: "StaffRide — enterprise staff transportation management",
  pageNumbers: true,
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, pdf);
console.log(`written ${OUT} (${pdf.length.toLocaleString()} bytes)`);
