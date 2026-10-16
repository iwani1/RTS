import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server bundle, so the runtime image needs nothing but
  // production dependencies. The migration folder is copied alongside it and
  // applied at container start.
  output: "standalone",
  // These run in the Node runtime and must not be bundled by Turbopack/webpack.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
    serverActions: {
      // The preview proxy terminates TLS and forwards to the app, so the
      // browser's Origin is the public host while the request Host is the
      // container's. Without this the Server Action CSRF check rejects every
      // mutation that arrives through a reverse proxy.
      allowedOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
    },
  },
  /**
   * Hosts the dev server may be reached from. Without this the sandboxed
   * preview origin is rejected and the HMR websocket never connects.
   */
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "*.e2b.app",
    "*.arena.ai",
  ],
  async headers() {
    return [
      {
        // The service worker must never be cached, or a stale worker pins an
        // old build of the app onto a device.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
