/**
 * Copy the SQL migrations into the standalone server bundle.
 *
 * Next's standalone output chdirs into `.next/standalone`, so the migration
 * folder has to live inside the bundle for a container to find it.
 */
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, ".next", "standalone", "drizzle");

await mkdir(target, { recursive: true });
await cp(path.join(root, "drizzle"), target, { recursive: true });
console.log("migrations copied to .next/standalone/drizzle");
