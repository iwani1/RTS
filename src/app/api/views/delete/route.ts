import { deleteViewAction } from "@/app/actions/platform";
import { authRedirect, readForm } from "@/lib/auth-forms";

/** Delete one of the signed-in user's saved views. */
export async function POST(request: Request) {
  const formData = await readForm(request);
  const result = await deleteViewAction(null, formData);
  const scope = String(formData.get("scope") ?? "");
  const base = String(formData.get("returnTo") ?? "") || defaultBase(scope);
  return authRedirect(
    request,
    base,
    result?.ok ? "notice" : "error",
    result?.message ?? "The view could not be removed.",
  );
}

function defaultBase(scope: string): string {
  if (scope === "trips") return "/trips";
  if (scope === "bookings") return "/bookings";
  return "/";
}
