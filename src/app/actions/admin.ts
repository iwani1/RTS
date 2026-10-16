"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  branches,
  companies,
  driverEarnings,
  drivers,
  employees,
  invoiceLines,
  invoices,
  maintenanceRecords,
  payments,
  routeStops,
  routes,
  serviceAgreements,
  shifts,
  stops,
  trips,
  users,
  vehicles,
} from "@/db/schema";
import type { ActionState } from "@/components/action-form";
import { PermissionError, withAction } from "@/lib/action-guard";
import {
  companyScope,
  hashPassword,
  logAudit,
  requireUser,
  revokeAllSessions,
  type SessionUser,
} from "@/lib/auth";
import { round2 } from "@/lib/domain";
import { ALL_ROLES, can, type Role } from "@/lib/rbac";
import { generateToken, parseCsvSafe } from "@/lib/csv-helpers";
import { ref } from "@/lib/utils";
import {
  emailSchema,
  nameSchema,
  optionalEnum,
  requiredString,
} from "@/lib/validation";

async function guard(permission: Parameters<typeof can>[1], user?: SessionUser) {
  const current = user ?? (await requireUser());
  if (!can(current.role as Role, permission)) {
    throw new PermissionError(
      "You do not have permission to perform this action.",
    );
  }
  return current;
}

/**
 * Form readers.
 *
 * Every value that reaches the database passes through one of these, so a
 * malformed submission is rejected as "missing" rather than crashing the query
 * with NaN. `num` and `dec` return `null` for anything that is not a finite
 * number; `str` drops values that exceed the length cap for the column.
 */
const str = (fd: FormData, key: string, max = 500) => {
  const raw = String(fd.get(key) ?? "").trim();
  return raw.length > max ? "" : raw;
};
const num = (fd: FormData, key: string) => {
  const raw = str(fd, key);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};
const dec = (fd: FormData, key: string) => {
  const raw = str(fd, key);
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? String(value) : null;
};


/* ------------------------------------------------- tenant-safe references */

/**
 * Resolve a branch id that must belong to `companyId`.
 * Returns `null` when no branch was supplied, `false` when the branch exists
 * but belongs to a different company.
 */
async function resolveBranchId(
  companyId: number,
  branchId: number | null,
): Promise<number | null | false> {
  if (!branchId) return null;
  const [row] = await db
    .select({ id: branches.id, companyId: branches.companyId })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  if (!row) return null;
  return row.companyId === companyId ? row.id : false;
}

/** Resolve a shift id that must belong to `companyId`. */
async function resolveShiftId(
  companyId: number,
  shiftId: number | null,
): Promise<number | null | false> {
  if (!shiftId) return null;
  const [row] = await db
    .select({ id: shifts.id, companyId: shifts.companyId })
    .from(shifts)
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row) return null;
  return row.companyId === companyId ? row.id : false;
}

/* ------------------------------------------------------------- companies */

async function createCompanyAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("company.manage");
  const name = str(fd, "name");
  if (!name) return { ok: false, message: "Company name is required." };
  const [created] = await db
    .insert(companies)
    .values({
      name,
      contactPerson: str(fd, "contactPerson") || null,
      email: str(fd, "email") || null,
      phone: str(fd, "phone") || null,
      industry: str(fd, "industry") || null,
      city: str(fd, "city") || null,
      billingModel: (str(fd, "billingModel") || "per_passenger") as "per_passenger",
      monthlyRate: dec(fd, "monthlyRate") ?? "0",
    })
    .returning({ id: companies.id });
  await logAudit({ user, action: "company.create", entity: "company", entityId: created.id, companyId: created.id });
  revalidatePath("/companies");
  return { ok: true, message: `${name} registered as a corporate client.` };
}

async function updateCompanyAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("company.manage");
  const id = num(fd, "id");
  if (!id) return { ok: false, message: "Missing company." };
  await db
    .update(companies)
    .set({
      status: str(fd, "status") as "active",
      billingModel: (str(fd, "billingModel") || undefined) as "per_passenger" | undefined,
      monthlyRate: dec(fd, "monthlyRate") ?? undefined,
      notes: str(fd, "notes") || null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, id));
  await logAudit({ user, action: "company.update", entity: "company", entityId: id, companyId: id });
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { ok: true, message: "Company profile updated." };
}

async function createBranchAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("company.manage");
  const companyId = num(fd, "companyId");
  const name = str(fd, "name");
  if (!companyId || !name) return { ok: false, message: "Company and branch name are required." };
  const [created] = await db
    .insert(branches)
    .values({
      companyId,
      name,
      address: str(fd, "address") || null,
      city: str(fd, "city") || null,
      lat: num(fd, "lat"),
      lng: num(fd, "lng"),
      isHeadquarters: str(fd, "isHeadquarters") === "on",
    })
    .returning({ id: branches.id });
  await logAudit({ user, action: "branch.create", entity: "branch", entityId: created.id, companyId });
  revalidatePath(`/companies/${companyId}`);
  return { ok: true, message: `Branch ${name} added.` };
}

async function createAgreementAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("company.manage");
  const companyId = num(fd, "companyId");
  const name = str(fd, "name");
  if (!companyId || !name) return { ok: false, message: "Company and agreement name are required." };
  const [created] = await db
    .insert(serviceAgreements)
    .values({
      companyId,
      name,
      pricingModel: (str(fd, "pricingModel") || "per_passenger") as "per_passenger",
      unitRate: dec(fd, "unitRate") ?? "0",
      fixedMonthlyAmount: dec(fd, "fixedMonthlyAmount") ?? "0",
      startDate: str(fd, "startDate") || new Date().toISOString().slice(0, 10),
      endDate: str(fd, "endDate") || null,
      slaOnTimePercent: num(fd, "slaOnTimePercent") ?? 95,
      slaResponseMinutes: num(fd, "slaResponseMinutes") ?? 15,
      maxPickupDeviationMinutes: num(fd, "maxPickupDeviationMinutes") ?? 10,
      cancellationPolicyHours: num(fd, "cancellationPolicyHours") ?? 2,
      notes: str(fd, "notes") || null,
    })
    .returning({ id: serviceAgreements.id });
  await logAudit({ user, action: "agreement.create", entity: "service_agreement", entityId: created.id, companyId });
  revalidatePath(`/companies/${companyId}`);
  return { ok: true, message: "Service agreement saved." };
}

/* ------------------------------------------------------------- employees */

async function createEmployeeAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const scopeCompanyId = user.role === "corporate_admin" ? user.companyId : num(fd, "companyId");
  if (!scopeCompanyId) return { ok: false, message: "Select the company this employee belongs to." };
  if (user.role === "corporate_admin" && user.companyId !== scopeCompanyId) {
    return { ok: false, message: "You can only register employees for your own company." };
  }
  if (user.role !== "corporate_admin" && !can(user.role as Role, "employee.manage")) {
    return { ok: false, message: "Not permitted." };
  }
  const fullName = str(fd, "fullName");
  const employeeCode = str(fd, "employeeCode") || ref("EMP");
  if (!fullName) return { ok: false, message: "Employee name is required." };

  // A branch or shift from another tenant must never be attached to this
  // employee — validate that both belong to the target company.
  const branchId = await resolveBranchId(scopeCompanyId, num(fd, "branchId"));
  if (branchId === false) return { ok: false, message: "That branch belongs to another company." };
  const shiftId = await resolveShiftId(scopeCompanyId, num(fd, "shiftId"));
  if (shiftId === false) return { ok: false, message: "That shift belongs to another company." };

  try {
    const [created] = await db
      .insert(employees)
      .values({
        companyId: scopeCompanyId,
        branchId: branchId || null,
        shiftId: shiftId || null,
        employeeCode,
        fullName,
        email: str(fd, "email") || null,
        phone: str(fd, "phone") || null,
        department: str(fd, "department") || null,
        jobTitle: str(fd, "jobTitle") || null,
        homeAddress: str(fd, "homeAddress") || null,
        homeLat: num(fd, "homeLat"),
        homeLng: num(fd, "homeLng"),
        zone: str(fd, "zone") || null,
        vip: str(fd, "vip") === "on",
      })
      .returning({ id: employees.id });
    await logAudit({ user, action: "employee.create", entity: "employee", entityId: created.id, companyId: scopeCompanyId });
    revalidatePath("/employees");
    return { ok: true, message: `${fullName} registered with code ${employeeCode}.` };
  } catch (error) {
    return { ok: false, message: `Could not save employee: ${(error as Error).message}` };
  }
}

async function importEmployeesAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const companyId = user.role === "corporate_admin" ? user.companyId : num(fd, "companyId");
  if (!companyId) return { ok: false, message: "Select a company for the import." };
  if (user.role !== "corporate_admin" && !can(user.role as Role, "employee.manage")) {
    return { ok: false, message: "Not permitted." };
  }
  const csv = String(fd.get("csv") ?? "");
  const rows = parseCsvSafe(csv);
  if (!rows.length) return { ok: false, message: "No data rows found. Expected a header row plus at least one employee." };

  const branchId = await resolveBranchId(companyId, num(fd, "branchId"));
  if (branchId === false) return { ok: false, message: "That branch belongs to another company." };

  let inserted = 0;
  const errors: string[] = [];
  for (const row of rows) {
    const fullName = row["full_name"] || row["name"];
    if (!fullName) {
      errors.push("A row is missing full_name");
      continue;
    }
    try {
      await db.insert(employees).values({
        companyId,
        branchId: branchId || null,
        employeeCode: row["employee_code"] || ref("EMP"),
        fullName,
        email: row["email"] || null,
        phone: row["phone"] || null,
        department: row["department"] || null,
        jobTitle: row["job_title"] || null,
        homeAddress: row["home_address"] || null,
        zone: row["zone"] || null,
        homeLat: row["home_lat"] ? Number(row["home_lat"]) : null,
        homeLng: row["home_lng"] ? Number(row["home_lng"]) : null,
      });
      inserted += 1;
    } catch (error) {
      errors.push(`${fullName}: ${(error as Error).message}`);
    }
  }
  await logAudit({ user, action: "employee.import", entity: "employee", companyId, details: { inserted, failed: errors.length } });
  revalidatePath("/employees");
  return {
    ok: inserted > 0,
    message: `Imported ${inserted} employee record(s).${errors.length ? ` ${errors.length} row(s) skipped: ${errors.slice(0, 3).join("; ")}` : ""}`,
  };
}

async function toggleEmployeeAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("employee.manage");
  const id = num(fd, "id");
  const active = str(fd, "active") === "true";
  if (!id) return { ok: false, message: "Missing employee." };

  // Tenant isolation: a corporate administrator may only act on employees of
  // their own company. Platform staff may act on any employee.
  const [target] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!target) return { ok: false, message: "That employee no longer exists." };
  const scope = companyScope(user);
  if (scope != null && target.companyId !== scope) {
    return { ok: false, message: "That employee belongs to another company." };
  }

  await db.update(employees).set({ active }).where(eq(employees.id, id));
  await logAudit({
    user,
    action: active ? "employee.activate" : "employee.deactivate",
    entity: "employee",
    entityId: id,
    companyId: target.companyId,
  });
  revalidatePath("/employees");
  return { ok: true, message: `Employee ${active ? "activated" : "deactivated"}.` };
}

async function createShiftAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("employee.manage");
  const companyId = user.role === "corporate_admin" ? user.companyId : num(fd, "companyId");
  const name = str(fd, "name");
  const startTime = str(fd, "startTime");
  const endTime = str(fd, "endTime");
  if (!companyId || !name || !startTime || !endTime) return { ok: false, message: "Company, shift name, start and end time are required." };
  const branchId = await resolveBranchId(companyId, num(fd, "branchId"));
  if (branchId === false) return { ok: false, message: "That branch belongs to another company." };
  const [created] = await db
    .insert(shifts)
    .values({ companyId, branchId: branchId || null, name, startTime, endTime, graceMinutes: num(fd, "graceMinutes") ?? 15 })
    .returning({ id: shifts.id });
  await logAudit({ user, action: "shift.create", entity: "employee_shift", entityId: created.id, companyId });
  revalidatePath("/employees");
  return { ok: true, message: `Shift ${name} configured.` };
}

async function assignEmployeeShiftAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("employee.manage");
  const id = num(fd, "id");
  const shiftId = num(fd, "shiftId");
  if (!id || !shiftId) return { ok: false, message: "Employee and shift are required." };

  // Both the employee and the shift must sit inside the caller's tenant.
  const [target] = await db
    .select({ id: employees.id, companyId: employees.companyId })
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!target) return { ok: false, message: "That employee no longer exists." };
  const scope = companyScope(user);
  if (scope != null && target.companyId !== scope) {
    return { ok: false, message: "That employee belongs to another company." };
  }

  const [shift] = await db
    .select({ id: shifts.id, companyId: shifts.companyId })
    .from(shifts)
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!shift) return { ok: false, message: "That shift no longer exists." };
  if (shift.companyId !== target.companyId) {
    return { ok: false, message: "That shift belongs to a different company." };
  }

  await db.update(employees).set({ shiftId }).where(eq(employees.id, id));
  await logAudit({
    user,
    action: "employee.assign_shift",
    entity: "employee",
    entityId: id,
    companyId: target.companyId,
    details: { shiftId },
  });
  revalidatePath("/employees");
  return { ok: true, message: "Shift assigned." };
}

/* ------------------------------------------------------------------ fleet */

async function createVehicleAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("vehicle.manage");
  const registrationNo = str(fd, "registrationNo");
  const make = str(fd, "make");
  const capacity = num(fd, "capacity");
  if (!registrationNo || !make || !capacity) return { ok: false, message: "Registration number, make and capacity are required." };
  try {
    const [created] = await db
      .insert(vehicles)
      .values({
        registrationNo,
        make,
        model: str(fd, "model") || make,
        year: num(fd, "year"),
        capacity,
        vehicleType: str(fd, "vehicleType") || "minibus",
        fuelType: str(fd, "fuelType") || "diesel",
        ownership: str(fd, "ownership") || "owned",
        assignedCompanyId: num(fd, "assignedCompanyId"),
        assignedDriverId: num(fd, "assignedDriverId"),
        odometerKm: num(fd, "odometerKm") ?? 0,
        avgKmPerLitre: num(fd, "avgKmPerLitre"),
        insuranceExpiry: str(fd, "insuranceExpiry") || null,
        roadworthinessExpiry: str(fd, "roadworthinessExpiry") || null,
        registrationExpiry: str(fd, "registrationExpiry") || null,
        costPerKm: dec(fd, "costPerKm") ?? "0",
        photoUrl: str(fd, "photoUrl") || null,
        status: "available",
      })
      .returning({ id: vehicles.id });
    await logAudit({ user, action: "vehicle.create", entity: "vehicle", entityId: created.id });
    revalidatePath("/fleet");
    return { ok: true, message: `Vehicle ${registrationNo} added to the fleet.` };
  } catch (error) {
    return { ok: false, message: `Could not add vehicle: ${(error as Error).message}` };
  }
}

async function updateVehicleAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("vehicle.manage");
  const id = num(fd, "id");
  if (!id) return { ok: false, message: "Missing vehicle." };
  await db
    .update(vehicles)
    .set({
      status: str(fd, "status") as "available",
      odometerKm: num(fd, "odometerKm") ?? undefined,
      insuranceExpiry: str(fd, "insuranceExpiry") || null,
      roadworthinessExpiry: str(fd, "roadworthinessExpiry") || null,
      registrationExpiry: str(fd, "registrationExpiry") || null,
      assignedCompanyId: num(fd, "assignedCompanyId"),
      notes: str(fd, "notes") || null,
    })
    .where(eq(vehicles.id, id));
  await logAudit({ user, action: "vehicle.update", entity: "vehicle", entityId: id, details: { status: str(fd, "status") } });
  revalidatePath("/fleet");
  return { ok: true, message: "Vehicle record updated." };
}

async function scheduleMaintenanceAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("vehicle.manage");
  const vehicleId = num(fd, "vehicleId");
  const description = str(fd, "description");
  const serviceDate = str(fd, "serviceDate");
  if (!vehicleId || !description || !serviceDate) return { ok: false, message: "Vehicle, description and service date are required." };
  const type = str(fd, "type") || "preventive";
  const [created] = await db
    .insert(maintenanceRecords)
    .values({
      vehicleId,
      type,
      description,
      cost: dec(fd, "cost") ?? "0",
      odometerKm: num(fd, "odometerKm"),
      serviceDate,
      nextServiceDate: str(fd, "nextServiceDate") || null,
      garageName: str(fd, "garageName") || null,
      status: type === "preventive" ? "completed" : "in_progress",
    })
    .returning({ id: maintenanceRecords.id });
  if (str(fd, "takeOffline") === "on") {
    await db.update(vehicles).set({ status: "under_maintenance" }).where(eq(vehicles.id, vehicleId));
  }
  await logAudit({ user, action: "maintenance.create", entity: "vehicle", entityId: vehicleId, details: { recordId: created.id, type } });
  revalidatePath("/fleet");
  return { ok: true, message: "Maintenance record captured." };
}

/* ---------------------------------------------------------------- drivers */

async function createDriverAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("driver.manage");
  const fullName = str(fd, "fullName");
  const phone = str(fd, "phone");
  const licenseNo = str(fd, "licenseNo");
  if (!fullName || !phone || !licenseNo) return { ok: false, message: "Name, phone and licence number are required." };
  const email = str(fd, "email") || null;
  let userId: number | null = null;
  const tempPassword = `Ride-${generateToken(3)}`;
  if (email) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    userId =
      existing?.id ??
      (
        await db
          .insert(users)
          .values({
            email,
            fullName,
            phone,
            passwordHash: await hashPassword(tempPassword),
            role: "driver",
            status: "active",
            invitedById: user.id,
          })
          .returning({ id: users.id })
      )[0].id;
  }
  const [created] = await db
    .insert(drivers)
    .values({
      userId,
      companyId: num(fd, "companyId"),
      fullName,
      phone,
      email,
      licenseNo,
      licenseClass: str(fd, "licenseClass") || null,
      licenseExpiry: str(fd, "licenseExpiry") || null,
      baseSalary: dec(fd, "baseSalary") ?? "0",
      tripAllowance: dec(fd, "tripAllowance") ?? "0",
      emergencyContactName: str(fd, "emergencyContactName") || null,
      emergencyContactPhone: str(fd, "emergencyContactPhone") || null,
      hiredAt: str(fd, "hiredAt") || null,
      status: "available",
    })
    .returning({ id: drivers.id });
  await logAudit({ user, action: "driver.create", entity: "driver", entityId: created.id, details: { accountCreated: Boolean(email) } });
  revalidatePath("/drivers");
  return {
    ok: true,
    message: email
      ? `Driver registered. Login ${email} with temporary password ${tempPassword} (share securely and require a change on first login).`
      : "Driver registered without a portal account.",
  };
}

async function updateDriverAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("driver.manage");
  const id = num(fd, "id");
  if (!id) return { ok: false, message: "Missing driver." };
  await db
    .update(drivers)
    .set({
      status: str(fd, "status") as "available",
      licenseExpiry: str(fd, "licenseExpiry") || null,
      baseSalary: dec(fd, "baseSalary") ?? undefined,
      tripAllowance: dec(fd, "tripAllowance") ?? undefined,
      notes: str(fd, "notes") || null,
    })
    .where(eq(drivers.id, id));
  await logAudit({ user, action: "driver.update", entity: "driver", entityId: id });
  revalidatePath("/drivers");
  return { ok: true, message: "Driver record updated." };
}

/* --------------------------------------------------------- routes & stops */

async function createStopAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("route.manage");
  const companyId = user.role === "corporate_admin" ? user.companyId : num(fd, "companyId");
  const name = str(fd, "name");
  if (!companyId || !name) return { ok: false, message: "Company and stop name are required." };
  const [created] = await db
    .insert(stops)
    .values({
      companyId,
      name,
      zone: str(fd, "zone") || null,
      address: str(fd, "address") || null,
      lat: num(fd, "lat"),
      lng: num(fd, "lng"),
    })
    .returning({ id: stops.id });
  await logAudit({ user, action: "stop.create", entity: "stop", entityId: created.id, companyId });
  revalidatePath("/routes");
  return { ok: true, message: `Stop ${name} created.` };
}

async function createRouteAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("route.manage");
  const companyId = user.role === "corporate_admin" ? user.companyId : num(fd, "companyId");
  const name = str(fd, "name");
  if (!companyId || !name) return { ok: false, message: "Company and route name are required." };
  const stopIds = fd.getAll("stopIds").map((v) => Number(v)).filter(Boolean);
  const [created] = await db
    .insert(routes)
    .values({
      companyId,
      branchId: num(fd, "branchId"),
      name,
      direction: (str(fd, "direction") || "home_to_office") as "home_to_office",
      zone: str(fd, "zone") || null,
      estimatedKm: num(fd, "estimatedKm") ?? 0,
      estimatedMinutes: num(fd, "estimatedMinutes") ?? 0,
    })
    .returning({ id: routes.id });
  if (stopIds.length) {
    await db.insert(routeStops).values(
      stopIds.map((stopId, index) => ({ routeId: created.id, stopId, sequence: index + 1, offsetMinutes: index * 8 })),
    );
  }
  await logAudit({ user, action: "route.create", entity: "route", entityId: created.id, companyId, details: { stops: stopIds.length } });
  revalidatePath("/routes");
  return { ok: true, message: `Route ${name} created with ${stopIds.length} stop(s).` };
}

async function toggleRouteAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("route.manage");
  const id = num(fd, "id");
  if (!id) return { ok: false, message: "Missing route." };
  const active = str(fd, "active") === "true";
  await db.update(routes).set({ active }).where(eq(routes.id, id));
  await logAudit({ user, action: active ? "route.activate" : "route.deactivate", entity: "route", entityId: id });
  revalidatePath("/routes");
  return { ok: true, message: `Route ${active ? "activated" : "deactivated"}.` };
}

/* ------------------------------------------------------------------- users */

async function inviteUserAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("user.manage");
  const emailResult = requiredString(fd, "email", emailSchema);
  if (!emailResult.ok) return { ok: false, message: emailResult.message };
  const email = emailResult.value;
  const nameResult = requiredString(fd, "fullName", nameSchema);
  if (!nameResult.ok) return { ok: false, message: nameResult.message };
  const fullName = nameResult.value;
  const roleResult = optionalEnum(fd, "role", ALL_ROLES);
  if (!roleResult.ok) return { ok: false, message: roleResult.message };
  const role = roleResult.value as Role | null;
  if (!role) return { ok: false, message: "Name, email and role are required." };

  // A user may only be created inside the caller's tenant, and a corporate
  // administrator may never mint a platform role.
  const targetCompany = num(fd, "companyId");
  const scope = companyScope(user);
  if (scope != null && targetCompany != null && targetCompany !== scope) {
    return { ok: false, message: "You can only create users for your own company." };
  }
  if (scope != null && role !== "corporate_admin" && role !== "employee" && role !== "driver") {
    return { ok: false, message: "That role is reserved for platform administrators." };
  }

  const tempPassword = `Ride-${generateToken(3)}`;
  try {
    const [created] = await db
      .insert(users)
      .values({
        email,
        fullName,
        phone: str(fd, "phone") || null,
        passwordHash: await hashPassword(tempPassword),
        role,
        status: "active",
        companyId: scope != null ? scope : targetCompany,
        invitedById: user.id,
        twoFactorEnabled: ["super_admin", "ops_manager", "finance_officer"].includes(role),
        twoFactorCode: ["super_admin", "ops_manager", "finance_officer"].includes(role) ? String(100000 + Math.floor(Math.random() * 899999)) : null,
      })
      .returning({ id: users.id });
    await logAudit({ user, action: "user.invite", entity: "user", entityId: created.id, details: { role } });
    revalidatePath("/settings");
    return { ok: true, message: `Invitation created. Temporary password: ${tempPassword}` };
  } catch (error) {
    return { ok: false, message: `Could not create user: ${(error as Error).message}` };
  }
}

async function updateUserStatusAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("user.manage");
  const id = num(fd, "id");
  const status = str(fd, "status");
  if (!id || !status) return { ok: false, message: "Missing user or status." };
  if (id === user.id) return { ok: false, message: "You cannot change your own account status." };
  await db.update(users).set({ status: status as "active" }).where(eq(users.id, id));
  await logAudit({ user, action: "user.status", entity: "user", entityId: id, details: { status } });
  revalidatePath("/settings");
  return { ok: true, message: `Account set to ${status}.` };
}

/**
 * Revoke every active session for a user. Used when a device is lost or a
 * password is suspected to be compromised.
 */
async function revokeUserSessionsAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("user.manage");
  const id = num(fd, "id");
  if (!id) return { ok: false, message: "Missing user." };

  const [target] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return { ok: false, message: "That user no longer exists." };
  const scope = companyScope(user);
  if (scope != null && target.companyId !== scope) {
    return { ok: false, message: "That user belongs to another company." };
  }

  await revokeAllSessions(id);
  await logAudit({ user, action: "user.sessions_revoked", entity: "user", entityId: id });
  revalidatePath("/settings");
  return { ok: true, message: "All sessions for that user have been signed out." };
}

/* ---------------------------------------------------------------- finance */

async function generateInvoiceAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("finance.manage");
  const companyId = num(fd, "companyId");
  if (!companyId) return { ok: false, message: "Select a company." };
  const periodStart = str(fd, "periodStart");
  const periodEnd = str(fd, "periodEnd");
  if (!periodStart || !periodEnd) return { ok: false, message: "Billing period is required." };

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) return { ok: false, message: "Company not found." };

  const [agreement] = await db
    .select()
    .from(serviceAgreements)
    .where(eq(serviceAgreements.companyId, companyId))
    .orderBy(desc(serviceAgreements.id))
    .limit(1);

  const completedTrips: Array<{
    bookedSeats: number | null;
    plannedKm: number | null;
    waitingMinutes: number | null;
    overtimeMinutes: number | null;
    direction: string;
  }> = await db
    .select({
      bookedSeats: trips.bookedSeats,
      plannedKm: trips.plannedKm,
      waitingMinutes: trips.waitingMinutes,
      overtimeMinutes: trips.overtimeMinutes,
      direction: trips.direction,
    })
    .from(trips)
    .where(
      and(
        eq(trips.companyId, companyId),
        eq(trips.status, "completed"),
        gte(trips.tripDate, periodStart),
        lte(trips.tripDate, periodEnd),
      ),
    );

  const tripCount = completedTrips.length;
  const passengers = completedTrips.reduce((sum: number, t) => sum + Number(t.bookedSeats ?? 0), 0);
  const km = completedTrips.reduce((sum: number, t) => sum + Number(t.plannedKm ?? 0), 0);
  const waitingMinutes = completedTrips.reduce((sum: number, t) => sum + Number(t.waitingMinutes ?? 0), 0);
  const overtimeMinutes = completedTrips.reduce((sum: number, t) => sum + Number(t.overtimeMinutes ?? 0), 0);

  const model = agreement?.pricingModel ?? company.billingModel;
  const rate = Number(agreement?.unitRate ?? 0);
  const lines: Array<{ description: string; category: string; quantity: string; unitPrice: string; amount: number }> = [];

  if (model === "per_passenger") {
    lines.push({ description: "Staff shuttle transport — passengers carried", category: "transport", quantity: String(passengers), unitPrice: String(rate), amount: Math.round(passengers * rate * 100) / 100 });
  } else if (model === "per_trip") {
    lines.push({ description: "Staff shuttle transport — completed trips", category: "transport", quantity: String(tripCount), unitPrice: String(rate), amount: Math.round(tripCount * rate * 100) / 100 });
  } else if (model === "distance_based") {
    lines.push({ description: "Staff shuttle transport — distance operated", category: "transport", quantity: String(km), unitPrice: String(rate), amount: Math.round(km * rate * 100) / 100 });
  } else {
    lines.push({ description: "Monthly transportation retainer", category: "retainer", quantity: "1", unitPrice: String(Number(agreement?.fixedMonthlyAmount ?? company.monthlyRate)), amount: Number(agreement?.fixedMonthlyAmount ?? company.monthlyRate) });
  }

  // Ad-hoc / emergency transport is billed at the contracted flat rate.
  const adHoc = completedTrips.filter((t) => t.direction === "ad_hoc").length;
  const extraTripCharge = Number(agreement?.extraTripCharge ?? 250);
  if (adHoc > 0) {
    lines.push({
      description: `Ad-hoc / emergency transport (${adHoc} trips)`,
      category: "extra",
      quantity: String(adHoc),
      unitPrice: extraTripCharge.toFixed(2),
      amount: round2(adHoc * extraTripCharge),
    });
  }

  // Waiting time accrued at pickup points, billed per hour.
  const waitingRate = Number(agreement?.waitingChargePerHour ?? 0);
  if (waitingMinutes > 0 && waitingRate > 0) {
    const hours = waitingMinutes / 60;
    lines.push({
      description: `Waiting time (${waitingMinutes} min)`,
      category: "waiting",
      quantity: hours.toFixed(2),
      unitPrice: waitingRate.toFixed(2),
      amount: round2(hours * waitingRate),
    });
  }

  // Time beyond the contracted arrival window, billed per hour.
  const overtimeRate = Number(agreement?.overtimeChargePerHour ?? 0);
  if (overtimeMinutes > 0 && overtimeRate > 0) {
    const hours = overtimeMinutes / 60;
    lines.push({
      description: `Overtime beyond schedule (${overtimeMinutes} min)`,
      category: "overtime",
      quantity: hours.toFixed(2),
      unitPrice: overtimeRate.toFixed(2),
      amount: round2(hours * overtimeRate),
    });
  }

  const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const tax = Math.round(subtotal * 0.15 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const [countRow] = await db.select({ v: sql<number>`count(*)` }).from(invoices);
  const invoiceNo = `INV-${new Date().getFullYear()}-${String(Number(countRow?.v ?? 0) + 1).padStart(4, "0")}`;

  const [invoice] = await db
    .insert(invoices)
    .values({
      companyId,
      invoiceNo,
      periodStart,
      periodEnd,
      subtotal: String(subtotal),
      tax: String(tax),
      total: String(total),
      amountPaid: "0",
      status: "issued",
      issuedAt: new Date(),
      dueDate: str(fd, "dueDate") || null,
      notes: `Generated from completed trips between ${periodStart} and ${periodEnd}.`,
    })
    .returning({ id: invoices.id });

  await db.insert(invoiceLines).values(
    lines.map((l) => ({
      invoiceId: invoice.id,
      description: l.description,
      category: l.category,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: String(l.amount),
    })),
  );

  await logAudit({ user, action: "invoice.generate", entity: "invoice", entityId: invoice.id, companyId, details: { total, trips: tripCount, passengers } });
  revalidatePath("/finance");
  return { ok: true, message: `Invoice ${invoiceNo} generated for ${moneySafe(total)} (${trips} trips, ${passengers} passengers).` };
}

function moneySafe(v: number) {
  return `GHS ${v.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function recordPaymentAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("finance.manage");
  const companyId = num(fd, "companyId");
  const amount = num(fd, "amount");
  if (!companyId || !amount || amount <= 0) return { ok: false, message: "Company and a positive amount are required." };
  const invoiceId = num(fd, "invoiceId");
  const method = (str(fd, "method") || "bank_transfer") as "bank_transfer";

  await db.insert(payments).values({
    companyId,
    invoiceId,
    amount: String(amount),
    method,
    reference: str(fd, "reference") || null,
    status: "successful",
    paidAt: new Date(),
    recordedById: user.id,
    notes: str(fd, "notes") || null,
  });

  if (invoiceId) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (invoice) {
      const paid = Number(invoice.amountPaid) + amount;
      const total = Number(invoice.total);
      await db
        .update(invoices)
        .set({ amountPaid: String(paid), status: paid >= total ? "paid" : "partial" })
        .where(eq(invoices.id, invoiceId));
    }
  }

  await logAudit({ user, action: "payment.record", entity: "payment", companyId, details: { amount, method, invoiceId } });
  revalidatePath("/finance");
  return { ok: true, message: `Payment of ${moneySafe(amount)} recorded.` };
}

async function approveEarningsAction__impl(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await guard("finance.manage");
  const period = str(fd, "periodStart");
  if (!period) return { ok: false, message: "Payroll period start is required." };
  const result = await db
    .update(driverEarnings)
    .set({ status: "approved" })
    .where(and(eq(driverEarnings.status, "accrued"), eq(driverEarnings.periodStart, period)))
    .returning({ id: driverEarnings.id });
  await logAudit({ user, action: "earnings.approve", entity: "driver_earnings", details: { period, count: result.length } });
  revalidatePath("/finance");
  return { ok: true, message: `${result.length} earnings record(s) approved for payroll.` };
}

/* ---------------------------------------------------------- wrappers */

export async function createCompanyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createCompanyAction__impl)(_p, fd);
}

export async function updateCompanyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(updateCompanyAction__impl)(_p, fd);
}

export async function createBranchAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createBranchAction__impl)(_p, fd);
}

export async function createAgreementAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createAgreementAction__impl)(_p, fd);
}

export async function createEmployeeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createEmployeeAction__impl)(_p, fd);
}

export async function importEmployeesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(importEmployeesAction__impl)(_p, fd);
}

export async function toggleEmployeeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(toggleEmployeeAction__impl)(_p, fd);
}

export async function createShiftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createShiftAction__impl)(_p, fd);
}

export async function assignEmployeeShiftAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(assignEmployeeShiftAction__impl)(_p, fd);
}

export async function createVehicleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createVehicleAction__impl)(_p, fd);
}

export async function updateVehicleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(updateVehicleAction__impl)(_p, fd);
}

export async function scheduleMaintenanceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(scheduleMaintenanceAction__impl)(_p, fd);
}

export async function createDriverAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createDriverAction__impl)(_p, fd);
}

export async function updateDriverAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(updateDriverAction__impl)(_p, fd);
}

export async function createStopAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createStopAction__impl)(_p, fd);
}

export async function createRouteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(createRouteAction__impl)(_p, fd);
}

export async function toggleRouteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(toggleRouteAction__impl)(_p, fd);
}

export async function inviteUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(inviteUserAction__impl)(_p, fd);
}

export async function updateUserStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(updateUserStatusAction__impl)(_p, fd);
}

export async function revokeUserSessionsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(revokeUserSessionsAction__impl)(_p, fd);
}

export async function generateInvoiceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(generateInvoiceAction__impl)(_p, fd);
}

export async function recordPaymentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(recordPaymentAction__impl)(_p, fd);
}

export async function approveEarningsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return withAction(approveEarningsAction__impl)(_p, fd);
}
