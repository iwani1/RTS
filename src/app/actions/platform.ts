"use server";

/**
 * Platform actions.
 *
 * The new surfaces — saved views, fuel logs, safety inspections, live trip
 * sharing, exchange rates and the job runner — live in their own module so
 * the operational core in `ops.ts` stays readable. The conventions are the
 * same: `__impl` for the body, `withAction` for the friendly failure, an
 * explicit permission guard, and a server-side authorisation check on every
 * write.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  exchangeRates,
  fuelLogs,
  safetyInspections,
  savedViews,
  trackingShares,
  trips,
  users,
  vehicles,
  employees,
} from "@/db/schema";
import type { ActionState } from "@/components/action-form";
import { PermissionError, withAction } from "@/lib/action-guard";
import { logAudit, requireUser } from "@/lib/auth";
import { can, type Role } from "@/lib/rbac";
import { runJob } from "@/lib/jobs";
import { listViews, saveView, deleteView } from "@/lib/views";
import { ref } from "@/lib/utils";

/** Form readers. Same contract as the operational action module. */
const str = (fd: FormData, k: string, max = 500) => {
  const raw = String(fd.get(k) ?? "").trim();
  return raw.length > max ? "" : raw;
};
const num = (fd: FormData, k: string) => {
  const raw = str(fd, k);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};
const dec = (fd: FormData, k: string) => {
  const raw = str(fd, k);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

async function guard(permission: Parameters<typeof can>[1]) {
  const user = await requireUser();
  if (!can(user.role as Role, permission))
    throw new PermissionError("You do not have permission to perform this action.");
  return user;
}

/* ---------------------------------------------------------- saved views */

async function saveViewAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const name = str(fd, "name", 80);
  const scope = str(fd, "scope", 40);
  if (!name) return { ok: false, message: "Give the view a name." };
  if (!scope) return { ok: false, message: "The view scope is missing." };

  // Only the filter keys the client sent, and only as short strings.
  const filters: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("filter.")) {
      const name2 = key.slice("filter.".length);
      if (!/^[a-zA-Z0-9_]{1,30}$/.test(name2)) continue;
      const text = String(value ?? "").trim().slice(0, 60);
      if (text) filters[name2] = text;
    }
  }

  const view = await saveView({ userId: user.id, name, scope, filters });
  revalidatePath(scope === "trips" ? "/trips" : scope === "bookings" ? "/bookings" : "/");
  return { ok: true, message: `View "${view.name}" saved.` };
}

async function deleteViewAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = num(fd, "id");
  if (!id) return { ok: false, message: "The view could not be identified." };
  const removed = await deleteView(user.id, id);
  if (!removed) return { ok: false, message: "That view no longer exists." };
  revalidatePath("/trips");
  revalidatePath("/bookings");
  return { ok: true, message: "View removed." };
}

/* ------------------------------------------------------------- fuel logs */

async function recordFuelLogAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("vehicle.manage");
  const vehicleId = num(fd, "vehicleId");
  const litres = dec(fd, "litres");
  const cost = dec(fd, "cost");
  if (!vehicleId) return { ok: false, message: "Select a vehicle." };
  if (!litres || litres <= 0) return { ok: false, message: "Enter the litres filled." };
  if (cost === null || cost < 0) return { ok: false, message: "Enter the amount paid." };

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  if (!vehicle) return { ok: false, message: "That vehicle does not exist." };

  const [row] = await db
    .insert(fuelLogs)
    .values({
      vehicleId,
      tripId: num(fd, "tripId"),
      driverId: num(fd, "driverId"),
      litres,
      cost: cost.toFixed(2),
      odometerKm: num(fd, "odometerKm"),
      station: str(fd, "station", 120) || null,
    })
    .returning({ id: fuelLogs.id });

  await logAudit({
    user,
    action: "fleet.fuel_logged",
    entity: "fuel_log",
    entityId: row.id,
    details: { vehicleId, litres, cost },
  });
  revalidatePath("/compliance");
  revalidatePath("/fleet");
  return {
    ok: true,
    message: `Fuel recorded for ${vehicle.registrationNo} — ${litres} L.`,
  };
}

/* --------------------------------------------------- safety inspections */

async function createSafetyInspectionAction__impl(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await guard("vehicle.manage");
  const vehicleId = num(fd, "vehicleId");
  const performedAt = str(fd, "performedAt", 10);
  if (!vehicleId) return { ok: false, message: "Select a vehicle." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedAt)) {
    return { ok: false, message: "Enter the date the inspection was performed." };
  }
  const type = str(fd, "type", 40) || "roadworthiness";
  const result = str(fd, "result", 40) || "pass";

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1);
  if (!vehicle) return { ok: false, message: "That vehicle does not exist." };

  // The next due date follows the inspection cycle: annual for the statutory
  // tests, quarterly for the in-house checks.
  const performed = new Date(`${performedAt}T00:00:00Z`);
  const intervalDays = type === "roadworthiness" || type === "annual" ? 365 : 90;
  const nextDueAt = new Date(performed.getTime() + intervalDays * 86400000)
    .toISOString()
    .slice(0, 10);

  const [row] = await db
    .insert(safetyInspections)
    .values({
      vehicleId,
      type: type as never,
      result: result as never,
      certificateNo: str(fd, "certificateNo", 60) || null,
      inspector: str(fd, "inspector", 120) || null,
      notes: str(fd, "notes", 1000) || null,
      performedAt,
      nextDueAt,
      createdById: user.id,
    })
    .returning({ id: safetyInspections.id });

  await logAudit({
    user,
    action: "fleet.inspection_recorded",
    entity: "safety_inspection",
    entityId: row.id,
    details: { vehicleId, type, result, nextDueAt },
  });
  revalidatePath("/compliance");
  revalidatePath("/fleet");
  return {
    ok: true,
    message: `Inspection recorded for ${vehicle.registrationNo}. Next due ${nextDueAt}.`,
  };
}

/* ------------------------------------------------------- live trip sharing */

/**
 * Share a trip with other passengers of the same corridor.
 *
 * The sharer must have granted location consent, and the code is short-lived
 * and revocable. A passenger who has the code can see how full the vehicle is
 * and where it is — not who is on board.
 */
async function shareTripAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const tripId = num(fd, "tripId");
  if (!tripId) return { ok: false, message: "Select a trip to share." };

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, user.id))
    .limit(1);
  if (!employee) {
    return { ok: false, message: "No employee profile is linked to your account." };
  }

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return { ok: false, message: "That trip does not exist." };

  // Only a passenger booked onto the trip may share it.
  const { bookings } = await import("@/db/schema");
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.tripId, tripId), eq(bookings.employeeId, employee.id)))
    .limit(1);
  if (!booking) {
    return { ok: false, message: "You can only share a trip you are booked on." };
  }

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

  const [row] = await db
    .insert(trackingShares)
    .values({ tripId, employeeId: employee.id, shareCode: code, expiresAt })
    .returning({ id: trackingShares.id });

  await logAudit({
    user,
    action: "passenger.trip_shared",
    entity: "tracking_share",
    entityId: row.id,
    details: { tripId },
  });
  revalidatePath("/passenger/corridor");
  return {
    ok: true,
    message: `Share code ${code} — it works for six hours.`,
    data: { code, expiresAt: expiresAt.toISOString() },
  };
}

async function revokeShareAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = num(fd, "id");
  if (!id) return { ok: false, message: "The share could not be identified." };

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, user.id))
    .limit(1);

  const rows = await db
    .update(trackingShares)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(trackingShares.id, id),
        ...(employee ? [eq(trackingShares.employeeId, employee.id)] : []),
      ),
    )
    .returning({ id: trackingShares.id });

  if (rows.length === 0) {
    return { ok: false, message: "That share is no longer active." };
  }
  revalidatePath("/passenger/corridor");
  return { ok: true, message: "Share revoked." };
}

/* ------------------------------------------------------- exchange rates */

async function updateExchangeRateAction__impl(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await guard("finance.manage");
  const code = str(fd, "code", 8).toUpperCase();
  const rate = dec(fd, "rateToBase");
  if (!/^[A-Z]{3}$/.test(code)) {
    return { ok: false, message: "Use a three-letter currency code." };
  }
  if (rate === null || rate <= 0) {
    return { ok: false, message: "Enter a rate greater than zero." };
  }
  const [existing] = await db
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.code, code))
    .limit(1);
  if (!existing) return { ok: false, message: "That currency is not configured." };
  if (existing.isBase) {
    return { ok: false, message: "The base currency rate is always one." };
  }

  await db
    .update(exchangeRates)
    .set({ rateToBase: rate.toFixed(8), asOf: new Date().toISOString().slice(0, 10) })
    .where(eq(exchangeRates.code, code));

  await logAudit({
    user,
    action: "finance.exchange_rate_updated",
    entity: "exchange_rate",
    details: { code, rate },
  });
  revalidatePath("/currencies");
  revalidatePath("/finance");
  return { ok: true, message: `${code} rate updated.` };
}

/* ---------------------------------------------------------- job runner */

async function runJobAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("audit.view");
  const name = str(fd, "name", 60);
  if (!name) return { ok: false, message: "No job was named." };

  const outcome = await runJob(name);
  revalidatePath("/operations");
  if (outcome.status === "failed") {
    return { ok: false, message: `${name} failed: ${outcome.error ?? "unknown error"}` };
  }
  return {
    ok: true,
    message: `${name} ${outcome.status} in ${outcome.durationMs}ms.`,
    data: outcome.detail as Record<string, string> | undefined,
  };
}

/* ---------------------------------------------------------- wrappers */

export async function saveViewAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(saveViewAction__impl)(_p, fd);
}

export async function deleteViewAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(deleteViewAction__impl)(_p, fd);
}

export async function recordFuelLogAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(recordFuelLogAction__impl)(_p, fd);
}

export async function createSafetyInspectionAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return withAction(createSafetyInspectionAction__impl)(_p, fd);
}

export async function shareTripAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(shareTripAction__impl)(_p, fd);
}

export async function revokeShareAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(revokeShareAction__impl)(_p, fd);
}

export async function updateExchangeRateAction(
  _p: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return withAction(updateExchangeRateAction__impl)(_p, fd);
}

export async function runJobAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(runJobAction__impl)(_p, fd);
}

/** Read-only helper used by the operations screen. */

