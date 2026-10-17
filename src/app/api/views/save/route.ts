import { saveViewAction } from "@/app/actions/platform";
import {
  authRedirect,
  crossSiteResponse,
  isCrossSiteRequest,
  readForm,
} from "@/lib/auth-forms";

/**
 * Save the current filters of a list under a name.
 *
 * A plain form post, so saving a view does not need a script bundle and the
 * form works the same way in every browser.
 */
export async function POST(request: Request) {
  // These handlers call the action directly, so React's own origin check
  // does not apply. A form post from another site is refused here.
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const formData = await readForm(request);
  const result = await saveViewAction(null, formData);
  const scope = String(formData.get("scope") ?? "");
  const base = String(formData.get("returnTo") ?? "") || defaultBase(scope);
  return authRedirect(
    request,
    base,
    result?.ok ? "notice" : "error",
    result?.message ?? "The view could not be saved.",
  );
}

function defaultBase(scope: string): string {
  if (scope === "trips") return "/trips";
  if (scope === "bookings") return "/bookings";
  return "/";
}
