import type { ReactNode } from "react";
import Link from "next/link";
import { ensureSeeded } from "@/lib/seed";
import { BrandMark } from "@/components/shell/sidebar";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // Seeds the demonstration dataset the first time the app is opened.
  try {
    await ensureSeeded();
  } catch {
    /* database may not be migrated yet - the login page still renders */
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* the left panel is the product, not decoration */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface-1 p-10 lg:flex">
        <div className="grid-noise pointer-events-none absolute inset-0 opacity-[0.35]" />

        <Link href="/" className="relative flex items-center gap-2.5">
          <BrandMark />
          <span>
            <span className="block font-display text-[14px] font-semibold tracking-[-0.01em] text-ink">
              Richie Transport Services
            </span>
            <span className="block text-[11.5px] text-ink-3">
              Staff Transportation Management
            </span>
          </span>
        </Link>

        <div className="relative max-w-md">
          <p className="eyebrow">The command centre</p>
          <h1 className="mt-3 font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink">
            Every staff journey, from booking to billing, in one place.
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">
            Capacity-aware routing, a live dispatch board, boarding verification,
            fleet compliance and corporate invoicing in Ghana Cedis.
          </p>

          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-line pt-6">
            <Fact label="Clients" value="3" />
            <Fact label="Vehicles" value="12" />
            <Fact label="Daily trips" value="98" />
          </dl>
        </div>

        <div className="relative flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-st-ok" />
          <p className="numeric text-[11.5px] text-ink-3">
            All systems operational · Greater Accra, Ghana · GHS
          </p>
        </div>
      </aside>

      <div className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <Link
            href="/"
            className="mb-8 flex items-center gap-2.5 lg:hidden"
          >
            <BrandMark />
            <span className="font-display text-[14px] font-semibold text-ink">
              Richie Transport Services
            </span>
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="numeric mt-1 text-[22px] font-medium leading-none text-ink">{value}</dd>
    </div>
  );
}
