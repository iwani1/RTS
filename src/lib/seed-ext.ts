/**
 * Extended seeding for the tables added to satisfy the master build prompt:
 * the normalised role model, addresses, trip assignments, fuel logs and safety
 * inspections.
 *
 * Everything here is derived from data that already exists (the RBAC matrix,
 * the employee home addresses, the trip assignments) so the database never
 * holds a second, conflicting copy of the truth.
 */
import { count, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  addresses,
  employees,
  fuelLogs,
  permissions,
  rolePermissions,
  roles,
  safetyInspections,
  tripAssignments,
  trips,
  userRoles,
  users,
  vehicles,
} from "@/db/schema";
import { PERMISSIONS, ROLE_LABELS, type Permission, type Role } from "./rbac";

let extendedSeed: Promise<void> | null = null;

export function ensureExtendedSeeded(): Promise<void> {
  if (!extendedSeed) {
    extendedSeed = run().catch((error) => {
      extendedSeed = null;
      throw error;
    });
  }
  return extendedSeed;
}

async function run(): Promise<void> {
  await seedRoleModel();
  await seedAddresses();
  await seedTripAssignments();
  await seedFuelLogs();
  await seedInspections();
}

/* ------------------------------------------------------- normalised roles */

async function seedRoleModel(): Promise<void> {
  const [roleCount] = await db.select({ v: count() }).from(roles);
  if (Number(roleCount?.v ?? 0) === 0) {
    await db.insert(roles).values(
      (Object.keys(ROLE_LABELS) as Role[]).map((key) => ({
        key,
        name: ROLE_LABELS[key],
        description: `${ROLE_LABELS[key]} role, seeded from the platform RBAC matrix.`,
        isSystem: true,
      })),
    );
  }

  const [permCount] = await db.select({ v: count() }).from(permissions);
  if (Number(permCount?.v ?? 0) === 0) {
    await db.insert(permissions).values(
      (Object.keys(PERMISSIONS) as Permission[]).map((key) => {
        const [resource, action] = key.split(".") as [string, string];
        return {
          key,
          resource,
          action,
          description: `Allows ${action} on ${resource}.`,
        };
      }),
    );
  }

  const roleRows = await db.select({ id: roles.id, key: roles.key }).from(roles);
  const permRows = await db.select({ id: permissions.id, key: permissions.key }).from(permissions);
  const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));
  const permIdByKey = new Map(permRows.map((p) => [p.key, p.id]));

  const wanted: Array<{ roleId: number; permissionId: number }> = [];
  for (const [permKey, allowedRoles] of Object.entries(PERMISSIONS) as Array<[Permission, Role[]]>) {
    const permissionId = permIdByKey.get(permKey);
    if (!permissionId) continue;
    for (const roleKey of allowedRoles) {
      const roleId = roleIdByKey.get(roleKey);
      if (roleId) wanted.push({ roleId, permissionId });
    }
  }

  const [existingGrants] = await db.select({ v: count() }).from(rolePermissions);
  if (Number(existingGrants?.v ?? 0) === 0 && wanted.length) {
    await db.insert(rolePermissions).values(wanted);
  }

  // Every user gets their primary role recorded in the join table, so the
  // database and the `users.role` fast path agree.
  const [grantCount] = await db.select({ v: count() }).from(userRoles);
  if (Number(grantCount?.v ?? 0) === 0) {
    const userRows = await db.select({ id: users.id, role: users.role }).from(users);
    const values = userRows
      .map((u) => {
        const roleId = roleIdByKey.get(u.role);
        return roleId ? { userId: u.id, roleId } : null;
      })
      .filter((v): v is { userId: number; roleId: number } => v !== null);
    if (values.length) await db.insert(userRoles).values(values);
  }
}

/* ------------------------------------------------------------- addresses */

async function seedAddresses(): Promise<void> {
  const [existing] = await db.select({ v: count() }).from(addresses);
  if (Number(existing?.v ?? 0) > 0) return;

  const rows = await db
    .select({
      id: employees.id,
      homeAddress: employees.homeAddress,
      homeLat: employees.homeLat,
      homeLng: employees.homeLng,
      zone: employees.zone,
    })
    .from(employees)
    .where(isNotNull(employees.homeAddress));

  if (!rows.length) return;

  const inserted = await db
    .insert(addresses)
    .values(
      rows.map((r) => ({
        employeeId: r.id,
        label: "home" as const,
        line1: r.homeAddress ?? "Address on file",
        city: "Accra",
        zone: r.zone,
        lat: r.homeLat,
        lng: r.homeLng,
        isPrimary: true,
      })),
    )
    .returning({ id: addresses.id, employeeId: addresses.employeeId });

  for (const row of inserted) {
    await db
      .update(employees)
      .set({ primaryAddressId: row.id })
      .where(eq(employees.id, row.employeeId));
  }
}

/* ------------------------------------------------------ trip assignments */

async function seedTripAssignments(): Promise<void> {
  const [existing] = await db.select({ v: count() }).from(tripAssignments);
  if (Number(existing?.v ?? 0) > 0) return;

  const rows = await db
    .select({
      id: trips.id,
      vehicleId: trips.vehicleId,
      driverId: trips.driverId,
    })
    .from(trips)
    .where(or(isNotNull(trips.vehicleId), isNotNull(trips.driverId)));

  if (!rows.length) return;

  await db.insert(tripAssignments).values(
    rows.map((r) => ({
      tripId: r.id,
      vehicleId: r.vehicleId,
      driverId: r.driverId,
      role: "primary" as const,
    })),
  );
}

/* ----------------------------------------------------------- fuel & upkeep */

async function seedFuelLogs(): Promise<void> {
  const [existing] = await db.select({ v: count() }).from(fuelLogs);
  if (Number(existing?.v ?? 0) > 0) return;

  const fleet = await db
    .select({ id: vehicles.id, odometer: vehicles.odometerKm, rate: vehicles.avgKmPerLitre })
    .from(vehicles);

  if (!fleet.length) return;

  const dayIso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const values = fleet.slice(0, 6).flatMap((v, i) => {
    const litres = 45 + i * 3;
    const cost = Math.round(litres * 14.5 * 100) / 100;
    return [
      {
        vehicleId: v.id,
        litres,
        cost: cost.toFixed(2),
        odometerKm: Math.max(0, (v.odometer ?? 100000) - 420 - i * 60),
        station: ["Shell Spintex", "Goil Tema", "Total Airport City", "Puma Circle"][i % 4],
        filledAt: new Date(`${dayIso(-9 - i)}T09:${String(10 + i).padStart(2, "0")}:00Z`),
      },
      {
        vehicleId: v.id,
        litres: Math.round(litres * 0.92),
        cost: (Math.round(litres * 0.92 * 14.5 * 100) / 100).toFixed(2),
        odometerKm: Math.max(0, (v.odometer ?? 100000) - 180 - i * 60),
        station: ["Goil Tema", "Total Airport City", "Shell Spintex", "Puma Circle"][i % 4],
        filledAt: new Date(`${dayIso(-2 - i)}T09:${String(8 + i).padStart(2, "0")}:00Z`),
      },
    ];
  });

  await db.insert(fuelLogs).values(values);
}

async function seedInspections(): Promise<void> {
  const [existing] = await db.select({ v: count() }).from(safetyInspections);
  if (Number(existing?.v ?? 0) > 0) return;

  const fleet = await db.select({ id: vehicles.id }).from(vehicles);
  if (!fleet.length) return;

  const dayIso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  await db.insert(safetyInspections).values(
    fleet.map((v, i) => ({
      vehicleId: v.id,
      type: "roadworthiness" as const,
      result: i === 3 ? ("conditional" as const) : ("pass" as const),
      certificateNo: `DVLA-RW-${2026 - (i % 3)}-${String(1000 + i)}`,
      inspector: "DVLA Accra",
      notes:
        i === 3
          ? "Brake pad wear approaching limit; replacement scheduled before next roadworthiness cycle."
          : "Passed. Tyres, lights, extinguisher and first-aid kit verified.",
      performedAt: dayIso(-30 - i),
      nextDueAt: dayIso(335 - i),
    })),
  );
}
