import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = {
  title: "Offline — StaffRide",
  description: "You are offline. StaffRide will reconnect automatically.",
};

/**
 * The offline shell served by the service worker when a navigation cannot
 * reach the network. It explains the situation and offers a retry rather than
 * showing a browser error page.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-abyss px-6 text-limestone">
      <div className="w-full max-w-md rounded-[12px] border border-line bg-surface-1 p-8">
        <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-surface-2">
          <WifiOff className="h-5 w-5 text-signal" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-[26px] leading-tight tracking-[-0.02em]">
          You are offline
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
          StaffRide could not reach the server. Anything you already loaded
          stays available, and anything you submit from a driver duty screen is
          queued and sent the moment the connection returns.
        </p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-full bg-signal px-4 text-[13px] font-medium text-abyss transition-colors duration-150 hover:bg-signal-hover"
          >
            Try again
          </Link>
          <Link
            href="/driver"
            className="inline-flex h-9 items-center rounded-full border border-line-strong px-4 text-[13px] text-ink-2 transition-colors duration-150 hover:border-ink-3"
          >
            Driver duties
          </Link>
        </div>
      </div>
    </main>
  );
}
