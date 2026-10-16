import type { NextConfig } from "next";

/**
 * Extra origins the server-action CSRF check and the dev server accept.
 *
 * A comma-separated list, e.g.
 *   SERVER_ACTION_ALLOWED_ORIGINS=192.168.1.42,my-host.local
 *
 * This is what a person testing the app on their own machine needs when the
 * app sits behind a reverse proxy that rewrites the `Host` header — the
 * browser then sends a public `Origin` that no longer matches the host the
 * request arrived on.
 *
 * A bare address on the local network already works without this: browse to
 * `http://192.168.1.42:3000` and the browser's `Origin` matches the `Host`
 * the request arrived on.
 */
const configuredOrigins = (process.env.SERVER_ACTION_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) =>
    value
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, ""),
  );

/**
 * The server-action CSRF check compares the origin's full `host:port` against
 * the allowed list, so a bare address is expanded to the port the server is
 * listening on as well. `192.168.1.42` therefore covers
 * `http://192.168.1.42:3000`.
 */
const actionOrigins = configuredOrigins.flatMap((host) => [
  host,
  `${host}:${process.env.PORT ?? "3000"}`,
]);

/**
 * The dev server compares the origin's bare hostname, with no port.
 */
const devOrigins = configuredOrigins;

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
      allowedOrigins: [
        "*.e2b.app",
        "*.arena.ai",
        "localhost",
        "127.0.0.1",
        "localhost:3000",
        "127.0.0.1:3000",
        ...actionOrigins,
      ],
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
    ...devOrigins,
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
