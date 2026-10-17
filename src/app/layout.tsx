import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { inter, jetbrainsMono, spaceGrotesk } from "./fonts";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Richie Transport Services Management System",
    template: "%s · Richie Transport Services",
  },
  description:
    "Run daily staff transportation for every corporate client from one command centre: bookings, shift-aware routing, dispatch, fleet compliance, live tracking, boarding verification and billing in Ghana Cedis.",
  applicationName: "Richie Transport Services",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Richie Transport Services", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#04070a" },
  ],
};

/**
 * Theme and density are applied before first paint so there is never a flash
 * of the wrong surface.
 */
const boot = `
(function(){
  try {
    var t = localStorage.getItem('tms-theme');
    var d = t || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (d === 'dark') document.documentElement.classList.add('dark');
    var dens = localStorage.getItem('tms-density') || 'comfortable';
    document.documentElement.dataset.density = dens;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className="bg-canvas text-ink antialiased">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
