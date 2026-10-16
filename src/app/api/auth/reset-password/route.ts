import { resetPasswordAction } from "@/app/actions/auth";
import { authRedirect, crossSiteResponse, isCrossSiteRequest, readForm } from "@/lib/auth-forms";

/** Native password-reset completion endpoint (see the login route for the rationale). */
export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const formData = await readForm(request);
  const result = await resetPasswordAction(null, formData);
  const token = String(formData.get("token") ?? "").trim();
  if (result?.ok) {
    return authRedirect(
      request,
      "/login",
      "notice",
      result.message ?? "Password updated. You can now sign in.",
    );
  }
  return authRedirect(
    request,
    "/reset-password",
    "error",
    result?.message ?? "The password could not be updated. Please try again.",
    token ? { token } : {},
  );
}
