import Link from "next/link";
import { StatusChip } from "@/components/ui";

export const metadata = { title: "Documentation" };

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 scroll-mt-20" id={id}>
      <h2 className="font-display text-[19px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-[8px] border border-line bg-surface-1 p-4 font-mono text-[12px] leading-relaxed text-ink-2">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <nav className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-signal font-display text-[13px] font-bold text-signal-ink">
            SR
          </span>
          <span className="font-display text-[15px] font-semibold text-ink">StaffRide</span>
        </Link>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-full bg-signal px-4 text-[13.5px] font-semibold text-signal-ink transition-colors duration-150 hover:bg-signal-press"
        >
          Sign in
        </Link>
      </nav>

      <h1 className="mt-10 font-display text-[30px] font-semibold tracking-[-0.02em] text-ink">
        Platform documentation
      </h1>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
        Enterprise staff transportation management system for multi-client shuttle
        operations. The functional MVP is fully implemented with persisted data;
        live operations and finance run against clearly labelled demo provider
        interfaces where no credential exists.
      </p>

      <Section id="architecture" title="Architecture">
        <p>
          Next.js (App Router) with React server components, TypeScript and Tailwind
          CSS. Business logic lives in framework-free modules so it can be unit
          tested and later extracted into a service layer.
        </p>
        <Code>{`src/
  app/
    (auth)/          login, register, password recovery
    (portal)/        role aware workspace (dashboard, dispatch, trips, bookings,
                     routes, employees, companies, fleet, drivers, incidents,
                     finance, reports, audit, settings, passenger, driver)
    actions/         server actions (admin, ops, auth) — authorisation enforced
    api/             REST endpoints: health, dispatch/live, driver/sync,
                     reports/export, auth/logout, search
  components/        UI primitives, shell, charts, vector map, dispatch centre
  db/                Drizzle schema + lazily initialised driver
  lib/
    auth.ts          hashed sessions, RBAC guards, audit logging, throttling
    rbac.ts          role → section/permission matrix
    domain.ts        pure business rules (capacity, routing, pricing, OTP)
    queries.ts       analytics aggregations
    seed.ts          demonstration dataset
  instrumentation.ts applies migrations + seeds at server start
tests/               node:test unit tests for booking/capacity/billing rules`}</Code>
        <p>
          Substitutions from the suggested stack: <strong>Drizzle ORM</strong>{" "}
          instead of Prisma (same relational guarantees, lighter runtime, first-class
          SQL escape hatch), <strong>cookie sessions with scrypt</strong> instead of
          a managed auth provider (no external dependency, easy to swap for
          Auth0/Clerk), and <strong>polling REST feed</strong> instead of
          WebSockets (deploy-friendly, upgrade path documented).
        </p>
        <p>
          The database driver is created lazily. Nothing touches the database at
          import time, so <code>next build</code> never needs a live database and
          migrations are applied once at server start by{" "}
          <code>src/instrumentation.ts</code>.
        </p>
      </Section>

      <Section id="roles" title="Roles and access">
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Super Administrator</strong> — full platform access including
            audit trail and user administration.
          </li>
          <li>
            <strong>Operations Manager</strong> — clients, employees, routes, trips,
            dispatch, bookings, incidents.
          </li>
          <li>
            <strong>Dispatcher</strong> — dispatch board, trip lifecycle, booking
            decisions, incident handling.
          </li>
          <li>
            <strong>Corporate HR Administrator</strong> — own company only:
            employees, bookings, trips, invoices, reports.
          </li>
          <li>
            <strong>Fleet Manager</strong> — vehicles, maintenance, drivers,
            incidents.
          </li>
          <li>
            <strong>Finance Officer</strong> — invoicing, payments, driver payroll,
            reports.
          </li>
          <li>
            <strong>Driver</strong> — own assignments, manifests, boarding
            verification, incident reporting.
          </li>
          <li>
            <strong>Employee / Passenger</strong> — own bookings, boarding codes,
            tracking, feedback.
          </li>
        </ul>
        <p>
          Authorisation is enforced server side on every mutating action (
          <code>requirePermission</code> / <code>guard()</code>) and again in the
          navigation matrix; tenant isolation is applied by scoping every query on{" "}
          <code>companyId</code>.
        </p>
      </Section>

      <Section id="data-model" title="Data model">
        <Code>{`companies ─┬─ company_branches ──┐
           ├─ employee_shifts  ┌──┴────────────┐
           ├─ employees ───────┤  trips        │
           ├─ stops            │  bookings ────┤ (trip_id, capacity guarded)
           ├─ routes ─ route_stops ┘            │
           ├─ service_agreements                │
           ├─ invoices ─ invoice_lines          │
           ├─ payments                          │
           └─ incidents                         │
users ─ sessions / password_resets / audit_logs / notifications
users ─ otp_codes / login_attempts / location_consents / user_roles
vehicles ─ maintenance_records ─ gps_events ─ fuel_logs ─ safety_inspections
drivers ─ driver_shifts / driver_earnings
passenger_boardings (booking_id, trip_id) unique per trip
trip_assignments / job_runs / saved_views / roles / permissions`}</Code>
        <p>
          Foreign keys use <code>on delete cascade</code> for owned children and{" "}
          <code>set null</code> for optional references. Hot lookup paths are
          indexed: <code>trips(trip_date,status)</code>,{" "}
          <code>bookings(company_id,booking_date)</code>,{" "}
          <code>gps_events(trip_id,recorded_at)</code>,{" "}
          <code>audit_logs(created_at)</code>. Retention: GPS events 90 days, audit
          logs 24 months, sessions 7 days.
        </p>
      </Section>

      <Section id="workflows" title="Core workflows">
        <ol className="list-inside list-decimal space-y-2">
          <li>
            <strong>Morning pickup.</strong> Employee books home→office → duplicate
            and policy validation → approval → planner clusters by zone, sequences
            stops (nearest neighbour), sizes the vehicle and recommends a driver →
            departure time derived from shift start minus route duration minus
            buffer → driver and passengers notified → driver starts the trip →
            boarding verified with the passenger&apos;s 6-digit code → completion
            accrues analytics and driver earnings.
          </li>
          <li>
            <strong>Evening drop-off.</strong> Confirmed passengers are allocated to
            return corridors, the driver receives the manifest, and each drop-off
            confirmation is recorded against the trip.
          </li>
          <li>
            <strong>Breakdown.</strong> Driver reports from the app → trip flips to{" "}
            <code>breakdown</code> and dispatch is alerted → dispatcher reassigns an
            available vehicle (capacity permitting) → passengers are notified of the
            replacement → incident is closed with the action taken.
          </li>
          <li>
            <strong>Missed pickup / no-show.</strong> Driver records a no-show, the
            seat is released, the booking is flagged and the client report reflects
            it.
          </li>
          <li>
            <strong>Monthly billing.</strong> Completed trips for the period are
            aggregated per pricing model (per passenger / per trip / per km / fixed
            retainer), VAT applied, invoice issued and payments reconciled; driver
            payroll accrues per completed trip with overtime.
          </li>
        </ol>
      </Section>

      <Section id="api" title="API reference">
        <Code>{`GET  /api/health                  liveness + database check
POST /api/auth/logout             destroy session (303 redirect)
GET  /api/dispatch/live           live positions + active trip feed (RBAC)
POST /api/driver/sync             offline queue replay: positions, boardings,
                                  no-shows (idempotent via clientRef)
GET  /api/reports/export?type=    operating | trips | bookings | payroll
      &from=&to=&company=          CSV download (RBAC + tenant scope)
GET  /api/search?q=               global search across the caller's scope

Server actions (form posts, same authorisation model):
  admin.createCompanyAction, admin.createEmployeeAction,
  admin.importEmployeesAction, admin.createVehicleAction,
  admin.scheduleMaintenanceAction, admin.createDriverAction,
  admin.createRouteAction, admin.inviteUserAction,
  admin.generateInvoiceAction, admin.recordPaymentAction,
  admin.revokeUserSessionsAction
  ops.planTripsAction, ops.createTripAction, ops.assignResourcesAction,
  ops.updateTripStatusAction, ops.decideBookingAction, ops.moveBookingAction,
  ops.createIncidentAction, ops.confirmBoardingAction, ops.markNoShowAction,
  ops.driverTripAction, ops.setAvailabilityAction,
  ops.createBookingAction, ops.cancelOwnBookingAction, ops.submitFeedbackAction
  auth.loginAction, auth.registerAction, auth.requestPasswordResetAction,
  auth.resetPasswordAction, auth.changeOwnPasswordAction, auth.logoutAction`}</Code>
      </Section>

      <Section id="configuration" title="Configuration">
        <Code>{`DATABASE_URL=postgresql://user:pass@host:5432/tms     # production
PGLITE_DATA_DIR=.data/pgdata                      # local fallback database
SEED_ON_BOOT=false                                # disable demo seeding
NEXT_PUBLIC_MAP_PROVIDER=mapbox|google            # optional
NEXT_PUBLIC_MAPBOX_TOKEN=...                      # optional (basemap)
PAYSTACK_SECRET_KEY=...                           # optional (payments)
FLUTTERWAVE_SECRET_KEY=...                        # optional (payments)
SMS_GATEWAY_URL=...                               # optional (notifications)
SMTP_URL=...                                      # optional (email)`}</Code>
        <p>
          Without <code>DATABASE_URL</code> the platform runs on PGlite — a real
          PostgreSQL engine compiled to WebAssembly, executing the same migrations
          in-process. That is how the demo boots with no server to install.{" "}
          Anything not configured falls back to a clearly labelled demo
          implementation: the vector map renders in-app, payment records are
          reconciliation entries only, notifications persist in-app, and GPS
          positions come from the driver app or manual dispatcher entry.
        </p>
      </Section>

      <Section id="operations" title="Standard operating procedures">
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>05:00</strong> Dispatcher opens the dispatch board, reviews
            driver availability and vehicle status.
          </li>
          <li>
            <strong>05:15</strong> Run the planner for home→office; review seat fill
            and move waitlisted passengers onto spare capacity.
          </li>
          <li>
            <strong>05:30 – 09:00</strong> Monitor departures; delays are flagged by
            drivers and passengers notified automatically.
          </li>
          <li>
            <strong>09:00</strong> Close morning exceptions (no-shows, breakdowns)
            with an incident note.
          </li>
          <li>
            <strong>16:30</strong> Plan the office→home return legs from the
            day&apos;s confirmed passengers.
          </li>
          <li>
            <strong>Month end</strong> Generate invoices per client, reconcile
            payments, approve driver payroll and export CSV.
          </li>
        </ul>
      </Section>

      <Section id="roadmap" title="Roadmap">
        <div className="overflow-x-auto rounded-[8px] border border-line">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  Phase
                </th>
                <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  Status
                </th>
                <th className="px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  Content
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-3 py-2.5 font-medium text-ink">Phase 1 — MVP</td>
                <td className="px-3 py-2.5">
                  <StatusChip tone="ok" label="Delivered" />
                </td>
                <td className="px-3 py-2.5">
                  Auth + RBAC, clients, employees, fleet, drivers, bookings, routes,
                  trips, dispatch, passenger and driver apps, PostgreSQL persistence,
                  seed data.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium text-ink">Phase 2 — Live ops</td>
                <td className="px-3 py-2.5">
                  <StatusChip tone="ok" label="Delivered (demo providers)" />
                </td>
                <td className="px-3 py-2.5">
                  GPS feed + live map, dispatch polling, notifications, boarding OTP,
                  planner improvements, driver availability, incidents, offline queue
                  sync, installable PWA shell.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium text-ink">Phase 3 — Finance</td>
                <td className="px-3 py-2.5">
                  <StatusChip tone="ok" label="Delivered" />
                </td>
                <td className="px-3 py-2.5">
                  Invoices, payments, driver earnings, payroll export, maintenance
                  reminders, SLA records, analytics, server-generated CSV and PDF
                  exports, scheduled invoicing, multicurrency, the route
                  optimisation solver, pagination and saved views.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2.5 font-medium text-ink">Phase 4 — Scale</td>
                <td className="px-3 py-2.5">
                  <StatusChip tone="caution" label="Delivered in part" />
                </td>
                <td className="px-3 py-2.5">
                  Delivered: OIDC/PKCE single sign-on, the observability stack
                  (structured JSON logs, Prometheus metrics), automated backups,
                  the scheduled job runner and the calendar scheduling view.
                  Still open: a real identity provider, real SMS/e-mail/push
                  delivery, OR-Tools as the VRP solver, a dedicated job worker
                  and native mobile apps.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="checklist" title="Feature checklist">
        <p>
          A per-module ledger of what is implemented, what is partial and what is
          still pending lives in{" "}
          <code>docs/FEATURE-CHECKLIST.md</code> in the repository, and the audit
          that produced it in <code>docs/AUDIT.md</code>.
        </p>
      </Section>

      <Section id="limitations" title="Known limitations">
        <ul className="list-inside list-disc space-y-1">
          <li>
            The route solver is a real Clarke-Wright savings heuristic with a
            2-opt pass — not OR-Tools. Time windows are soft, there is a single
            depot, and the solution is not proven optimal. The screen says so.
          </li>
          <li>
            There is no identity provider configured. The OIDC client performs a
            real authorization-code exchange with PKCE, but without an issuer
            the SSO buttons stay hidden.
          </li>
          <li>
            SMS, email and push messages are composed and recorded with a
            delivery status of <em>simulated</em> until provider credentials are
            configured. Mapping and payment providers behave the same way.
          </li>
          <li>
            Exchange rates are a dated snapshot, not a live feed. A production
            deployment should record the rate actually used on an invoice so a
            historical invoice never re-prices.
          </li>
          <li>
            GPS positions arrive through the driver endpoint rather than a
            telematics vendor poller. The geofence job works on whatever
            positions are in the database.
          </li>
          <li>
            The job runner is a single-process timer, which is the right shape
            for one application container plus managed PostgreSQL.
          </li>
        </ul>
      </Section>

      <p className="mt-10 text-[12px] text-ink-3">
        See <code>README.md</code>, <code>docs/API.md</code>,{" "}
        <code>docs/OPERATIONS.md</code>, <code>docs/ARCHITECTURE.md</code> and{" "}
        <code>tests/domain.test.ts</code> in the repository for the full
        deliverables.
      </p>
    </div>
  );
}
