import { verifyPhoneOtpAction } from "@/app/actions/auth";
import { authRedirect, crossSiteResponse, isCrossSiteRequest, readForm } from "@/lib/auth-forms";

/** Verify a phone sign-in code and open the session. */
export async function POST(request: Request) {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  const formData = await readForm(request);
  const result = await verifyPhoneOtpAction(null, formData);
  return authRedirect(
    request,
    "/otp",
    "error",
    result?.message ?? "That code could not be verified.",
    { email: String(formData.get("email") ?? "") },
  );
}
