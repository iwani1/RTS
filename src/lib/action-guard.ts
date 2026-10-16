import type { ActionState } from "@/components/action-form";

/** Raised when the signed-in user lacks the permission an action requires. */
export class PermissionError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "PermissionError";
  }
}

/** Raised when submitted data fails validation. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Next.js signals control-flow (redirect, not-found) with a thrown error that
 * carries a `digest` string. Those must be re-thrown, not swallowed.
 */
const NEXT_CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)/;

function isControlFlow(error: unknown): boolean {
  if (error && typeof error === "object" && "digest" in error) {
    const digest = String((error as { digest?: unknown }).digest ?? "");
    return NEXT_CONTROL_FLOW.test(digest);
  }
  return false;
}

/** Map a thrown value onto a message that is safe to show a user. */
export function describeError(error: unknown): string {
  if (error instanceof PermissionError) return error.message;
  if (error instanceof ValidationError) return error.message;

  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") return "That record already exists.";
  if (code === "23503") return "That record is still referenced elsewhere.";
  if (code === "23502") return "A required field was missing.";
  if (code === "22P02") return "One of the values submitted was not valid.";
  if (code === "57014" || code === "40001") return "The request timed out. Please try again.";

  if (error instanceof Error && error.message) {
    // Known, user-facing messages are safe to surface verbatim.
    if (
      error.message.startsWith("You do not have permission") ||
      error.message.startsWith("Missing ") ||
      error.message.startsWith("Invalid ") ||
      error.message.startsWith("Not ")
    ) {
      return error.message;
    }
  }
  return "Something went wrong. Please try again.";
}

/**
 * Wraps a server action so that an unexpected failure renders an inline,
 * friendly message instead of a 500 page, and so that a missing permission
 * reads as "you may not do that" rather than "server error".
 */
export function withAction(
  impl: (prev: ActionState, fd: FormData) => Promise<ActionState>,
): (prev: ActionState, fd: FormData) => Promise<ActionState> {
  return async (prev, fd) => {
    try {
      return await impl(prev, fd);
    } catch (error) {
      if (isControlFlow(error)) throw error;
      console.error("[action] unhandled failure:", error);
      return { ok: false, message: describeError(error) };
    }
  };
}
