import { loginAction } from "@/app/actions/auth";
import { authRedirect, crossSiteResponse, isCrossSiteRequest, readForm } from "@/lib/auth-forms";

/**
 * Native sign-in endpoint.
 *
 * The login screen posts here with a plain HTML form so a user without
 * JavaScript can still authenticate. The server action below owns the
 * business rules; this route only adapts the HTTP shape.
 */
export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const formData = await readForm(request);
  const result = await loginAction(null, formData);
  // A successful attempt redirects inside the action and never returns here.
  return authRedirect(
    request,
    "/login",
    "error",
    result?.message ?? "Sign-in failed. Please try again.",
  );
}
