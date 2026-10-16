import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getLatestPositions, getLiveTrips } from "@/lib/queries";
import { canAccess, type Role } from "@/lib/rbac";
import type { MapPoint } from "@/components/live-map";

export const dynamic = "force-dynamic";

/** Live dispatch feed: latest known position for every active duty. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!canAccess(user.role as Role, "dispatch") && !canAccess(user.role as Role, "dashboard")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scope = user.role === "corporate_admin" ? user.companyId : null;
  const live = await getLiveTrips(scope);
  const positions = await getLatestPositions(live.map((l) => l.trip.id));

  const points: MapPoint[] = [];
  for (const l of live) {
    const pos = positions.find((p) => p.tripId === l.trip.id);
    if (!pos) continue;
    points.push({
      id: `t${l.trip.id}`,
      lat: pos.lat,
      lng: pos.lng,
      label: `${l.vehicle?.registrationNo ?? "TBC"} · ${l.company.name}`,
      kind: "vehicle",
      tone: l.trip.status === "in_progress" ? "teal" : l.trip.status === "delayed" || l.trip.status === "breakdown" ? "rose" : "navy",
    });
  }

  return NextResponse.json(
    {
      updatedAt: new Date().toISOString(),
      activeTrips: live.length,
      points,
      trips: live.map((l) => ({
        id: l.trip.id,
        reference: l.trip.reference,
        status: l.trip.status,
        company: l.company.name,
        vehicle: l.vehicle?.registrationNo ?? null,
        driver: l.driver?.fullName ?? null,
        bookedSeats: l.trip.bookedSeats,
        capacity: l.trip.capacity,
        scheduledDeparture: l.trip.scheduledDeparture,
        lastPosition: positions.find((p) => p.tripId === l.trip.id) ?? null,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
