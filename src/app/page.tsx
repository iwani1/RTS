import Link from "next/link";
import { getSessionUser, homeFor } from "@/lib/auth";
import type { Role } from "@/lib/rbac";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, employees, trips, vehicles } from "@/db/schema";
import { HeroVisual, StepPath, ArrowLink } from "@/components/marketing/hero-visual";

export const dynamic = "force-dynamic";

const PILLARS = [
  {
    title: "One tenant, one truth",
    body: "Every record carries a company. A corporate HR administrator can only see and write their own client's employees, bookings, invoices and incidents — enforced on the server, not in the interface.",
  },
  {
    title: "Operations, not administration",
    body: "Dispatchers work a three-pane command centre: a live trip board, the corridor map, and the inspector. Every control on it is wired to a real action that writes to the database.",
  },
  {
    title: "Accounts that close",
    body: "Charges are computed from actual trip days, waiting minutes and overtime against the client's contracted rate, then invoiced, collected and reconciled against driver payroll.",
  },
];

const STEPS = [
  { title: "Register the client", body: "Companies, branches, service agreements with SLAs, shifts and routes." },
  { title: "Plan the corridor", body: "Capacity-aware routing with pickup time windows and shift-aware departure times." },
  { title: "Dispatch and track", body: "Assign vehicles and drivers, verify boarding by OTP, watch the corridor live." },
  { title: "Bill and settle", body: "Generate the invoice from real trips, collect payment, approve driver earnings." },
];

export default async function LandingPage() {
  const user = await getSessionUser();

  // Real numbers, read from the seeded database. The marketing page never
  // invents a metric.
  const [clientCount, employeeCount, tripCount, vehicleCount] = await Promise.all([
    db.select({ v: count() }).from(companies),
    db.select({ v: count() }).from(employees),
    db.select({ v: count() }).from(trips),
    db.select({ v: count() }).from(vehicles),
  ]);

  const stats = [
    { label: "Corporate clients onboarded", value: String(Number(clientCount?.[0]?.v ?? 0)) },
    { label: "Employees registered", value: String(Number(employeeCount?.[0]?.v ?? 0)) },
    { label: "Trips in the ledger", value: String(Number(tripCount?.[0]?.v ?? 0)) },
    { label: "Vehicles under management", value: String(Number(vehicleCount?.[0]?.v ?? 0)) },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* ------------------------------------------------------------ nav */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-signal font-display text-[13px] font-bold text-signal-ink">
              SR
            </span>
            <span className="font-display text-[15px] font-semibold tracking-[-0.01em]">
              StaffRide
            </span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <Link
              href="/docs"
              className="hidden rounded-full px-3 py-1.5 text-[13px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink sm:block"
            >
              Documentation
            </Link>
            <Link
              href={user ? homeFor(user.role as Role) : "/login"}
              className="inline-flex h-9 items-center rounded-full bg-signal px-4 text-[13.5px] font-semibold text-signal-ink transition-colors duration-150 hover:bg-signal-press"
            >
              {user ? "Open my workspace" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>

      {/* ----------------------------------------------------------- hero */}
      <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-24 lg:pt-20">
        <div>
          <p className="eyebrow mb-4">Staff transportation management</p>
          <h1 className="font-display text-[38px] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-[52px]">
            Every corporate shuttle,
            <br />
            on one operational spine.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2">
            Bookings, shift-aware routing, live dispatch, fleet compliance,
            boarding verification, invoicing in Ghana Cedis and operational
            analytics — running on a real, migrated PostgreSQL schema with
            server-side authorisation on every write.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={user ? homeFor(user.role as Role) : "/login"}
              className="inline-flex h-11 items-center rounded-full bg-signal px-6 text-[14px] font-semibold text-signal-ink transition-colors duration-150 hover:bg-signal-press"
            >
              {user ? "Go to my workspace" : "Enter the platform"}
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-[14px] text-ink transition-colors duration-150 hover:bg-surface-2"
            >
              Architecture &amp; API
            </Link>
          </div>
          <p className="mt-5 text-[12px] text-ink-3">
            The demo dataset seeds automatically. Mapping, SMS and payment
            providers are labelled as such — nothing pretends to be live that
            is not.
          </p>
        </div>

        <HeroVisual />
      </section>

      {/* ---------------------------------------------------------- proof */}
      <section className="border-y border-line bg-surface-1">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="eyebrow mb-5">The platform as it stands</p>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-surface-1 px-4 py-4">
                <dt className="text-[12px] text-ink-3">{stat.label}</dt>
                <dd className="numeric mt-1.5 font-display text-[28px] font-medium leading-none tracking-[-0.02em] text-ink">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------- pillars */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="mb-10 max-w-2xl">
          <p className="eyebrow mb-3">What it is</p>
          <h2 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">
            Built for the dispatcher, the finance officer and the driver — on
            the same data.
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-[8px] border border-line bg-line md:grid-cols-3">
          {PILLARS.map((pillar, index) => (
            <article key={pillar.title} className="bg-surface-1 p-6">
              <p className="numeric text-[11px] text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2.5 font-display text-[16px] font-semibold tracking-[-0.01em] text-ink">
                {pillar.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                {pillar.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- steps */}
      <section className="border-y border-line bg-surface-1">
        <div className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
          <div className="mb-10 max-w-2xl">
            <p className="eyebrow mb-3">How it runs</p>
            <h2 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">
              From contract to collection in four steps.
            </h2>
          </div>
          <StepPath steps={STEPS} />
        </div>
      </section>

      {/* -------------------------------------------------------- security */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <p className="eyebrow mb-3">Security &amp; tenancy</p>
            <h2 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">
              Eight roles. One permission matrix. No client sees another
              client.
            </h2>
            <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-ink-2">
              Authorisation is resolved on the server for every server action
              and every API route. Session tokens and password-reset tokens are
              stored as hashes, logins are rate limited, and every mutation
              writes an audit record.
            </p>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-2">
            {[
              { term: "Session storage", detail: "SHA-256 token hash — a database leak cannot be replayed" },
              { term: "Login throttling", detail: "Five failures per identifier inside a 15-minute window" },
              { term: "Password hashing", detail: "Asynchronous scrypt, never on the event loop" },
              { term: "Audit trail", detail: "Actor, entity, action and tenant on every write" },
              { term: "Tenant isolation", detail: "Company scope resolved server-side, not in the UI" },
              { term: "Input validation", detail: "Bounded, typed parsing with friendly error messages" },
            ].map((item) => (
              <div key={item.term} className="bg-surface-1 px-4 py-4">
                <dt className="font-display text-[13px] font-semibold text-ink">
                  {item.term}
                </dt>
                <dd className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section className="border-y border-line bg-signal">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-14 sm:flex-row sm:items-center sm:justify-between lg:py-16">
          <h2 className="max-w-2xl font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-signal-ink sm:text-[32px]">
            Take the operation for a spin on seeded data.
          </h2>
          <Link
            href={user ? homeFor(user.role as Role) : "/login"}
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-abyss px-6 text-[14px] font-semibold text-limestone transition-colors duration-150 hover:bg-charcoal"
          >
            {user ? "Open my workspace" : "Sign in"}
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="bg-canvas">
        <div className="mx-auto max-w-6xl px-6 pb-10 pt-14">
          <div className="grid gap-10 md:grid-cols-[1.4fr_2fr]">
            <div>
              <p className="font-display text-[13px] font-medium text-ink-2">
                StaffRide
              </p>
              <p className="mt-3 max-w-xs text-[12.5px] leading-relaxed text-ink-3">
                An enterprise staff transportation platform for corporate
                fleets in Ghana — dispatch, fleet, finance and safety on one
                operational spine.
              </p>
              <p className="mt-5 inline-flex items-center gap-2 text-[12px] text-ink-3">
                <span className="h-[7px] w-[7px] rounded-full bg-st-ok" />
                <span className="numeric">All services operational</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {[
                {
                  title: "Product",
                  links: [
                    { label: "Dispatch board", href: "/dispatch" },
                    { label: "Fleet", href: "/fleet" },
                    { label: "Bookings", href: "/bookings" },
                    { label: "Finance", href: "/finance" },
                  ],
                },
                {
                  title: "Roles",
                  links: [
                    { label: "Driver app", href: "/driver" },
                    { label: "Passenger app", href: "/passenger" },
                    { label: "Audit trail", href: "/audit" },
                    { label: "Settings", href: "/settings" },
                  ],
                },
                {
                  title: "Engineering",
                  links: [
                    { label: "Documentation", href: "/docs" },
                    { label: "API reference", href: "/docs#api" },
                    { label: "Operations runbook", href: "/docs#operations" },
                    { label: "Feature checklist", href: "/docs#checklist" },
                  ],
                },
                {
                  title: "Access",
                  links: [
                    { label: "Sign in", href: "/login" },
                    { label: "Register", href: "/register" },
                    { label: "Reset password", href: "/forgot-password" },
                    { label: "Offline shell", href: "/offline" },
                  ],
                },
              ].map((column) => (
                <div key={column.title}>
                  <p className="eyebrow mb-3">{column.title}</p>
                  <ul className="space-y-2">
                    {column.links.map((link) => (
                      <li key={link.href + link.label}>
                        <ArrowLink href={link.href}>{link.label}</ArrowLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 border-t border-line pt-6">
            <p className="font-display text-[clamp(2.5rem,9vw,5.5rem)] font-semibold leading-[0.85] tracking-[-0.045em] text-ink">
              StaffRide
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
              <span>© {new Date().getFullYear()} StaffRide</span>
              <span aria-hidden>|</span>
              <span>Ghana Cedi (GHS)</span>
              <span aria-hidden>|</span>
              <span>Africa/Accra</span>
              <span aria-hidden>|</span>
              <span>Demo dataset — no live client data</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
