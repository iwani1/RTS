/**
 * Registers the TypeScript resolver hook for the test runner.
 *
 * `node --import ./scripts/register-ts.mjs --test tests/`
 */
import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);
