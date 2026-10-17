/**
 * A resolver hook that lets Node run the TypeScript sources directly.
 *
 * The application imports its own modules without a file extension, which is
 * what the bundler expects. Node's ESM resolver wants the exact path, so
 * this hook adds `.ts` when a relative import has no extension of its own.
 * It is used by the test runner only; the application never sees it.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[cm]?[jt]s$/.test(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      try {
        return await nextResolve(`${specifier}/index.ts`, context);
      } catch {
        // Fall through to the default resolution and let Node report it.
      }
    }
  }
  return nextResolve(specifier, context);
}
