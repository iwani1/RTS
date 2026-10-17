#!/usr/bin/env python3
"""
Audit: does every exported server action enforce authorisation *before* it
mutates anything?

Rules applied to each exported function body:
  - must call one of: requireUser / requireSection / requirePermission /
    getSessionUser / createSession / verifyPassword (auth actions may
    legitimately be anonymous)
  - must validate input: zod parse, or an explicit length/type check
  - must not read a tenant scope from the form (client-controlled companyId
    used directly to write rows) without intersecting with the caller's scope
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [
    "src/app/actions/admin.ts",
    "src/app/actions/ops.ts",
    "src/app/actions/auth.ts",
    "src/app/actions/platform.ts",
    "src/app/actions/finance.ts",
    "src/app/actions/providers.ts",
]

GUARDS = [
    "guard(",
    "requireUser",
    "requireSection",
    "requirePermission",
    "getSessionUser",
    "createSession",
    "verifyPassword",
    "generateOtp",
]
# Permissions that a tenant-scoped role can hold. An action guarded by one of
# these MUST intersect the caller's company scope before it writes; an action
# guarded by a platform-only permission never needs to.
SCOPED_PERMISSIONS = {
    "employee.manage",
    "booking.approve",
    "booking.own",
    "incident.report",
    "driver.duty",
}

MUTATIONS = [
    ".insert(",
    ".update(",
    ".delete(",
    "revalidatePath",
]
INPUT_USE = re.compile(r"fd\.get\(|formData\.get\(")
VALIDATORS = ["zod", "z.", "safeParse", ".parse(", "parseInt", "Number(",
              "requiredString(", "optionalString(", "optionalEnum(", "requiredNumber(",
              "optionalNumber(", "check(", "withAction(", "passwordPair(",
              "passwordSchema.safeParse", "emailSchema.safeParse",
              "nameSchema.safeParse", "phoneSchema.safeParse",
              "verifyTotp(", "verifyPassword(", "generateOtp(", "verifyOtp("]

# An action whose implementation is a one-line delegation to another action
# inherits that action's guard. The audit follows `__impl` indirection, so it
# needs to be told about the second level too.
DELEGATIONS = {
    "reportIncidentFromAppAction": "createIncidentAction",
}

# Actions that are deliberately public. They are reachable without a session
# and must therefore be safe on their own terms: they either do not write to
# protected data, or they prove possession of something first.
PUBLIC_ACTIONS = {
    "registerAction",
    "requestPasswordResetAction",
    "resetPasswordAction",
    "requestPhoneOtpAction",
    "verifyPhoneOtpAction",
    "logoutAction",
}


def split_functions(src: str):
    """Yield (name, body) for each exported async function.

    Actions are wrapped in `withAction(...)`; the exported function body is a
    one-line delegation, so the real implementation lives in a sibling
    `__impl` function. The audit follows that indirection.
    """
    impls = {}
    for match in re.finditer(
        r"^(?:export )?async function (\w+__impl)\s*\(", src, re.MULTILINE
    ):
        name = match.group(1)
        body = _body_of(src, match.end())
        if body:
            impls[name[: -len("__impl")]] = body

    for match in re.finditer(
        r"^export (?:async )?function (\w+)\s*\(", src, re.MULTILINE
    ):
        name = match.group(1)
        body = _body_of(src, match.end())
        if not body:
            continue
        delegated = re.search(r"withAction\((\w+)__impl\)", body)
        if delegated and delegated.group(1) in impls:
            body = impls[delegated.group(1)]
        if name in DELEGATIONS:
            target = DELEGATIONS[name]
            if target in impls:
                body = impls[target]
        yield name, body


def _body_of(src: str, start: int) -> str:
    """Return the braced body that begins at/after `start`."""
    i = src.find("{", start)
    if i == -1:
        return ""
    depth = 0
    j = i
    while j < len(src):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                break
        j += 1
    return src[i : j + 1]


def main() -> int:
    total = 0
    unauth = []
    unvalidated = []
    details = []

    for rel in FILES:
        path = ROOT / rel
        src = path.read_text()
        for name, body in split_functions(src):
            total += 1
            guards = []
            for g in GUARDS:
                hit = (g in body) if g.endswith("(") else (g + "(" in body)
                if hit:
                    guards.append(g)
            permission = None
            m = re.search(r'guard\("([\w.]+)"', body)
            if m:
                permission = m.group(1)
            mutates = any(m in body for m in MUTATIONS)
            has_input = bool(INPUT_USE.search(body))
            has_validator = any(v in body for v in VALIDATORS)
            checks = {
                "guard": guards,
                "mutates": mutates,
                "input": has_input,
                "validator": has_validator,
                "zod": (
                    "zod" in body.lower()
                    or "Schema.safeParse" in body
                    or "requiredString(" in body
                    or "optionalString(" in body
                    or "optionalEnum(" in body
                    or "requiredNumber(" in body
                    or "optionalNumber(" in body
                    or "passwordPair(" in body
                ),
                "tenant": (
                    "companyScope" in body
                    or "scopeCompanyId" in body
                    or "resolveBranchId" in body
                    or "resolveShiftId" in body
                    or "user.companyId" in body
                ),
                "scoped_permission": permission in SCOPED_PERMISSIONS,
            }
            details.append((rel, name, checks))

            if not guards and name not in PUBLIC_ACTIONS:
                unauth.append(f"{rel}:{name}")
            if has_input and not has_validator:
                unvalidated.append(f"{rel}:{name}")

    print(f"exported server actions audited: {total}\n")

    print("--- authorisation guard present ---")
    ok = [d for d in details if d[2]["guard"] or d[1] in PUBLIC_ACTIONS]
    print(f"  guarded   : {len(ok)}/{total}")
    print(f"  unguarded : {total - len(ok)}")
    for item in unauth:
        print(f"    ! {item}")
    public = [d for d in details if d[1] in PUBLIC_ACTIONS and not d[2]["guard"]]
    if public:
        print(f"  ({len(public)} deliberately public: "
              + ", ".join(d[1] for d in public) + ")")

    print("\n--- input validation ---")
    print(f"  unvalidated actions (read form data, no parser): {len(unvalidated)}")
    for item in unvalidated:
        print(f"    ! {item}")

    zod_actions = [d for d in details if d[2]["zod"]]
    print(f"\n  actions using zod: {len(zod_actions)}/{total}")

    mutating = [d for d in details if d[2]["mutates"]]
    print(f"  mutating actions: {len(mutating)}")

    print("\n--- detail ---")
    for rel, name, c in details:
        flags = []
        if not c["guard"]:
            flags.append("NO-GUARD")
        if c["input"] and not c["validator"]:
            flags.append("NO-VALIDATION")
        if c["mutates"] and c["scoped_permission"] and not c["tenant"]:
            flags.append("NO-TENANT-SCOPE")
        if c["zod"]:
            flags.append("zod")
        print(
            f"  {name:<34} guard={','.join(c['guard']) or '—':<28} "
            f"{' '.join(flags)}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
