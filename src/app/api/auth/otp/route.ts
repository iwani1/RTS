import { requestPhoneOtpAction } from "@/app/actions/auth";
import { authRedirect, crossSiteResponse, isCrossSiteRequest, readForm } from "@/lib/auth-forms";

/**
 * Request a phone sign-in code.
 *
 * The screen posts here with a plain HTML form, so phone sign-in works with
 * JavaScript disabled — the same reason the password route exists.
 */
export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const formData = await readForm(request);
  const result = await requestPhoneOtpAction(null, formData);
  if (!result?.ok) {
    return authRedirect(
      request,
      "/otp",
      "error",
      result?.message ?? "The code could not be issued. Please try again.",
    );
  }
  return authRedirect(
    request,
    "/otp",
    "notice",
    result.message ?? "If that account exists, a sign-in code has been sent.",
    result.data?.code ? { code: result.data.code } : {},
  );
}
