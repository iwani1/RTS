/**
 * Prepare the standalone server bundle.
 *
 * Next's standalone output contains the server and its dependencies, but it
 * leaves two things behind in the project root:
 *
 *   • the SQL migrations, which the server applies at boot;
 *   • the hashed client assets under `.next/static`, which the browser
 *     requests as `/_next/static/...`.
 *
 * Without the second copy the server starts, every page renders, and the
 * stylesheet 404s — the app comes up unstyled. Both are copied into the
 * bundle so that `node .next/standalone/server.js` is a complete, working
 * server from the project root, exactly as it is inside the container.
 */
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

// The migrations, so the server can bring the schema up to date at boot.
const migrations = path.join(standalone, "drizzle");
await mkdir(migrations, { recursive: true });
await cp(path.join(root, "drizzle"), migrations, { recursive: true });
console.log("migrations copied to .next/standalone/drizzle");

// The client assets, so the pages are styled rather than bare.
const staticTarget = path.join(standalone, ".next", "static");
await mkdir(staticTarget, { recursive: true });
await cp(path.join(root, ".next", "static"), staticTarget, { recursive: true });
console.log("client assets copied to .next/standalone/.next/static");
