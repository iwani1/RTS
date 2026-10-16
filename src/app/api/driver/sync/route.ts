import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { boardings, bookings, drivers, gpsEvents, trips } from "@/db/schema";
import { getSessionUser, logAudit } from "@/lib/auth";
import { describeError } from "@/lib/action-guard";

export const dynamic = "force-dynamic";

type QueueItem =
  | { kind: "position"; tripId: number; lat: number; lng: number; speedKph?: number; heading?: number; clientRef?: string; recordedAt?: string }
  | { kind: "boarding"; bookingId: number; otp: string; clientRef?: string }
  | { kind: "no_show"; bookingId: number; clientRef?: string; note?: string };

/**
 * Offline queue synchronisation endpoint for the driver app.
 * The client stores actions while offline and replays them here; every item carries
 * a clientRef which is used to de-duplicate replays.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "driver") {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const [driver] = await db.select().from(drivers).where(eq(drivers.userId, user.id)).limit(1);
  if (!driver) return NextResponse.json({ error: "No driver record" }, { status: 400 });

  let payload: { items?: QueueItem[] };
  try {
    payload = (await request.json()) as { items?: QueueItem[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return NextResponse.json({ accepted: 0, results: [] });

  const seen = new Set<string>();
  const results: Array<{ clientRef?: string; ok: boolean; message: string }> = [];

  for (const item of items) {
    const key = `${item.kind}:${item.clientRef ?? ""}`;
    if (item.clientRef && seen.has(key)) continue;
    if (item.clientRef) seen.add(key);

    try {
      if (item.kind === "position") {
        const [trip] = await db.select().from(trips).where(eq(trips.id, item.tripId)).limit(1);
        if (!trip || trip.driverId !== driver.id) {
          results.push({ clientRef: item.clientRef, ok: false, message: "Trip not assigned to you" });
          continue;
        }
        const existing = item.clientRef
          ? await db
              .select({ id: gpsEvents.id })
              .from(gpsEvents)
              .where(sql`${gpsEvents.source} = ${"driver_app:" + item.clientRef}`)
              .limit(1)
          : [];
        if (existing.length) {
          results.push({ clientRef: item.clientRef, ok: true, message: "Duplicate ignored" });
          continue;
        }
        await db.insert(gpsEvents).values({
          tripId: item.tripId,
          vehicleId: trip.vehicleId,
          lat: item.lat,
          lng: item.lng,
          speedKph: item.speedKph ?? 0,
          heading: item.heading ?? 0,
          source: `driver_app:${item.clientRef ?? "sync"}`,
          recordedAt: item.recordedAt ? new Date(item.recordedAt) : new Date(),
        });
        results.push({ clientRef: item.clientRef, ok: true, message: "Position stored" });
      } else if (item.kind === "boarding" || item.kind === "no_show") {
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, item.bookingId)).limit(1);
        if (!booking || !booking.tripId) {
          results.push({ clientRef: item.clientRef, ok: false, message: "Booking not attached to a trip" });
          continue;
        }
        const [trip] = await db.select().from(trips).where(eq(trips.id, booking.tripId)).limit(1);
        if (!trip || trip.driverId !== driver.id) {
          results.push({ clientRef: item.clientRef, ok: false, message: "Trip not assigned to you" });
          continue;
        }
        const [already] = await db
          .select({ id: boardings.id })
          .from(boardings)
          .where(and(eq(boardings.bookingId, booking.id), eq(boardings.tripId, trip.id)))
          .limit(1);
        if (already) {
          results.push({ clientRef: item.clientRef, ok: true, message: "Already recorded" });
          continue;
        }
        if (item.kind === "no_show") {
          await db.insert(boardings).values({
            bookingId: booking.id,
            tripId: trip.id,
            noShow: true,
            note: item.note ?? "Passenger not present (offline record)",
            recordedById: user.id,
          });
          await db.update(bookings).set({ status: "no_show" }).where(eq(bookings.id, booking.id));
          results.push({ clientRef: item.clientRef, ok: true, message: "No-show recorded" });
          continue;
        }
        if (booking.otpCode && item.otp !== booking.otpCode) {
          results.push({ clientRef: item.clientRef, ok: false, message: "Invalid boarding code" });
          continue;
        }
        await db.insert(boardings).values({
          bookingId: booking.id,
          tripId: trip.id,
          boardedAt: new Date(),
          otpVerified: true,
          recordedById: user.id,
        });
        await db.update(bookings).set({ status: "in_progress" }).where(eq(bookings.id, booking.id));
        results.push({ clientRef: item.clientRef, ok: true, message: "Boarding confirmed" });
      }
    } catch (error) {
      // The message goes to the driver's device, so it must not carry a
      // database error verbatim — those name tables, columns and constraint
      // definitions. `describeError` maps the known ones to something
      // readable and keeps the rest generic.
      results.push({
        clientRef: item.clientRef,
        ok: false,
        message: describeError(error),
      });
    }
  }

  await logAudit({ user, action: "driver.sync", entity: "driver", entityId: driver.id, details: { items: items.length } });
  return NextResponse.json({ accepted: results.filter((r) => r.ok).length, results });
}
