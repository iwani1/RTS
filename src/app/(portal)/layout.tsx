import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

/**
 * The portal shell. Authentication is enforced here; capability checks are
 * declared by each page with `requireSection(...)`, so a page can never render
 * content the role is not entitled to.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <AppShell section="dashboard">{children}</AppShell>;
}
