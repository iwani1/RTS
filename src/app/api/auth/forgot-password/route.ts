import { requestPasswordResetAction } from "@/app/actions/auth";
import { authRedirect, readForm } from "@/lib/auth-forms";

/** Native password-reset request endpoint (see the login route for the rationale). */
export async function POST(request: Request) {
  const formData = await readForm(request);
  const result = await requestPasswordResetAction(null, formData);
  if (!result?.ok) {
    return authRedirect(
      request,
      "/forgot-password",
      "error",
      result?.message ?? "The reset request failed. Please try again.",
    );
  }
  // No mail provider is configured in this environment, so the generated link
  // is handed straight back to the user instead of being emailed.
  const token = result.data?.token;
  if (token) {
    return authRedirect(
      request,
      "/reset-password",
      "notice",
      result.message ?? "A reset link has been generated.",
      {
        token,
      },
    );
  }
  return authRedirect(
    request,
    "/forgot-password",
    "notice",
    result.message ?? "If that account exists, a reset link has been generated.",
  );
}
