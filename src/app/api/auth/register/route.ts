import { registerAction } from "@/app/actions/auth";
import { authRedirect, readForm } from "@/lib/auth-forms";

/** Native self-registration endpoint (see the login route for the rationale). */
export async function POST(request: Request) {
  const formData = await readForm(request);
  const result = await registerAction(null, formData);
  if (result?.ok) {
    return authRedirect(
      request,
      "/login",
      "notice",
      result.message ?? "Registration received.",
    );
  }
  return authRedirect(
    request,
    "/register",
    "error",
    result?.message ?? "Registration failed. Please try again.",
  );
}
