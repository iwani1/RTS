import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  bookings,
  boardings,
  branches,
  companies,
  driverEarnings,
  driverShifts,
  drivers,
  employees,
  feedback,
  gpsEvents,
  incidents,
  invoiceLines,
  invoices,
  maintenanceRecords,
  notifications,
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
import { hashPassword } from "./auth";
import { ensureExtendedSeeded } from "./seed-ext";

export const DEMO_PASSWORD = "Password123!";

const at = (iso: string, hh: number, mm = 0) => new Date(`${iso}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
const dayIso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const ZONES: Array<[string, number, number]> = [
  ["Dansoman", 5.548, -0.241],
  ["Lapaz", 5.612, -0.231],
  ["Madina", 5.6837, -0.1664],
  ["Spintex", 5.629, -0.101],
  ["Achimota", 5.6218, -0.2135],
  ["Kasoa", 5.534, -0.416],
  ["Tema", 5.6698, -0.0166],
  ["Airport Residential", 5.605, -0.178],
];

const FIRST = ["Ama", "Kwame", "Akosua", "Yaw", "Abena", "Kofi", "Adjoa", "Kwabena", "Efua", "Nana", "Serwaa", "Kojo", "Esi", "Fiifi", "Akua", "Mensima", "Tetteh", "Adjei", "Dede", "Nii"];
const LAST = ["Mensah", "Owusu", "Boateng", "Asante", "Agyapong", "Darko", "Addo", "Quartey", "Tetteh", "Nkrumah", "Sarpong", "Amoah", "Baidoo", "Okai", "Lamptey"];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

let seedPromise: Promise<void> | null = null;

/** Idempotent: only seeds when the platform has no companies yet. */
export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const [existing] = await db.select({ v: count() }).from(companies);
  if (Number(existing?.v ?? 0) > 0) {
    const { ensureExtendedSeeded } = await import("./seed-ext");
    await ensureExtendedSeeded();
    return;
  }
  const rnd = rand(42);
  const pw = await hashPassword(DEMO_PASSWORD);

  /* ------------------------------------------------------------ companies */
  const companyRows = await db
    .insert(companies)
    .values([
      {
        name: "Sikaman Financial Services",
        contactPerson: "Gifty Asamoah",
        email: "hr@sikamanfinancial.com",
        phone: "+233 30 274 1180",
        industry: "Financial Services",
        city: "Accra",
        billingModel: "per_passenger" as const,
        monthlyRate: "42000.00",
      },
      {
        name: "Accra Tech Hub Ltd",
        contactPerson: "Daniel Tetteh",
        email: "ops@accratechhub.com",
        phone: "+233 30 298 4471",
        industry: "Technology",
        city: "Accra",
        billingModel: "distance_based" as const,
        monthlyRate: "28500.00",
      },
      {
        name: "Volta Foods Manufacturing",
        contactPerson: "Henrietta Doe",
        email: "transport@voltafoods.com",
        phone: "+233 33 202 6611",
        industry: "Manufacturing",
        city: "Tema",
        billingModel: "monthly_fixed" as const,
        monthlyRate: "56000.00",
      },
    ])
    .returning({ id: companies.id, name: companies.name });

  const cSikaman = companyRows[0];
  const cTech = companyRows[1];
  const cVolta = companyRows[2];

  const branchRows = await db
    .insert(branches)
    .values([
      { companyId: cSikaman.id, name: "Head Office - Ring Road", address: "12 Ring Road East, Accra", city: "Accra", lat: 5.6037, lng: -0.187, isHeadquarters: true },
      { companyId: cSikaman.id, name: "Airport City Branch", address: "Airport City, Accra", city: "Accra", lat: 5.6058, lng: -0.1787 },
      { companyId: cTech.id, name: "One Airport Square", address: "Airport City, Accra", city: "Accra", lat: 5.6045, lng: -0.1799, isHeadquarters: true },
      { companyId: cVolta.id, name: "Tema Factory", address: "Heavy Industrial Area, Tema", city: "Tema", lat: 5.6698, lng: -0.0166, isHeadquarters: true },
    ])
    .returning({ id: branches.id, companyId: branches.companyId, name: branches.name, lat: branches.lat, lng: branches.lng });

  const hq = (companyId: number) => branchRows.find((b) => b.companyId === companyId)!;

  /* --------------------------------------------------------------- users */
  const userRows = await db
    .insert(users)
    .values([
      { email: "admin@staffridegh.com", fullName: "Nana Kojo Admin", role: "super_admin" as const, passwordHash: pw, phone: "+233 24 111 0001", twoFactorEnabled: true, twoFactorCode: "246810" },
      { email: "ops@staffridegh.com", fullName: "Comfort Baffour", role: "ops_manager" as const, passwordHash: pw, phone: "+233 24 111 0002" },
      { email: "dispatch@staffridegh.com", fullName: "Ekow Mensah", role: "dispatcher" as const, passwordHash: pw, phone: "+233 24 111 0003" },
      { email: "fleet@staffridegh.com", fullName: "Yaw Ofori-Attah", role: "fleet_manager" as const, passwordHash: pw, phone: "+233 24 111 0004" },
      { email: "finance@staffridegh.com", fullName: "Esther Nyarko", role: "finance_officer" as const, passwordHash: pw, phone: "+233 24 111 0005" },
      { email: "hr@sikamanfinancial.com", fullName: "Gifty Asamoah", role: "corporate_admin" as const, passwordHash: pw, companyId: cSikaman.id, phone: "+233 20 555 1010" },
      { email: "ops@accratechhub.com", fullName: "Daniel Tetteh", role: "corporate_admin" as const, passwordHash: pw, companyId: cTech.id, phone: "+233 20 555 2020" },
      { email: "transport@voltafoods.com", fullName: "Henrietta Doe", role: "corporate_admin" as const, passwordHash: pw, companyId: cVolta.id, phone: "+233 20 555 3030" },
      { email: "ama@sikamanfinancial.com", fullName: "Ama Serwaa", role: "employee" as const, passwordHash: pw, companyId: cSikaman.id, phone: "+233 24 777 0001" },
      { email: "kwame@sikamanfinancial.com", fullName: "Kwame Boateng", role: "employee" as const, passwordHash: pw, companyId: cSikaman.id, phone: "+233 24 777 0002" },
      { email: "kojo@accratechhub.com", fullName: "Kojo Nkrumah", role: "employee" as const, passwordHash: pw, companyId: cTech.id, phone: "+233 24 777 0003" },
      { email: "driver.kwesi@staffridegh.com", fullName: "Kwesi Appiah", role: "driver" as const, passwordHash: pw, phone: "+233 24 888 0001" },
      { email: "driver.abena@staffridegh.com", fullName: "Abena Darko", role: "driver" as const, passwordHash: pw, phone: "+233 24 888 0002" },
    ])
    .returning({ id: users.id, email: users.email, role: users.role, companyId: users.companyId });

  const userBy = (email: string) => userRows.find((u) => u.email === email)!;

  /* -------------------------------------------------------------- shifts */
  const shiftRows = await db
    .insert(shifts)
    .values([
      { companyId: cSikaman.id, branchId: hq(cSikaman.id).id, name: "Morning (08:00 - 17:00)", startTime: "08:00", endTime: "17:00" },
      { companyId: cSikaman.id, branchId: hq(cSikaman.id).id, name: "Evening (13:00 - 22:00)", startTime: "13:00", endTime: "22:00" },
      { companyId: cSikaman.id, branchId: hq(cSikaman.id).id, name: "Night (21:00 - 06:00)", startTime: "21:00", endTime: "06:00" },
      { companyId: cTech.id, branchId: hq(cTech.id).id, name: "Morning (09:00 - 18:00)", startTime: "09:00", endTime: "18:00" },
      { companyId: cTech.id, branchId: hq(cTech.id).id, name: "Night (20:00 - 05:00)", startTime: "20:00", endTime: "05:00" },
      { companyId: cVolta.id, branchId: hq(cVolta.id).id, name: "Plant Day (07:00 - 19:00)", startTime: "07:00", endTime: "19:00" },
      { companyId: cVolta.id, branchId: hq(cVolta.id).id, name: "Plant Night (19:00 - 07:00)", startTime: "19:00", endTime: "07:00" },
    ])
    .returning({ id: shifts.id, companyId: shifts.companyId, name: shifts.name, startTime: shifts.startTime, endTime: shifts.endTime });

  /* ----------------------------------------------------------- employees */
  type EmpSeed = typeof employees.$inferInsert;
  const employeeSeeds: EmpSeed[] = [];
  const employeeUserIds: Record<string, number> = {
    "ama@sikamanfinancial.com": userBy("ama@sikamanfinancial.com").id,
    "kwame@sikamanfinancial.com": userBy("kwame@sikamanfinancial.com").id,
    "kojo@accratechhub.com": userBy("kojo@accratechhub.com").id,
  };

  let empCounter = 1000;
  const companyPlan = [
    { company: cSikaman, count: 14, prefix: "SFS", departments: ["Finance", "Risk", "Operations", "IT"] },
    { company: cTech, count: 10, prefix: "ATH", departments: ["Engineering", "Product", "Support"] },
    { company: cVolta, count: 12, prefix: "VFM", departments: ["Production", "Quality", "Logistics"] },
  ];

  companyPlan.forEach((plan, ci) => {
    const companyShifts = shiftRows.filter((s) => s.companyId === plan.company.id);
    for (let i = 0; i < plan.count; i++) {
      const zone = ZONES[(i + ci * 2) % ZONES.length];
      const first = FIRST[(i * 3 + ci) % FIRST.length];
      const last = LAST[(i * 5 + ci) % LAST.length];
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}${ci}@${plan.company.name.split(" ")[0].toLowerCase()}.com`;
      const isLinked = i === 0 && ci === 0 ? "ama@sikamanfinancial.com" : i === 1 && ci === 0 ? "kwame@sikamanfinancial.com" : i === 0 && ci === 1 ? "kojo@accratechhub.com" : null;
      empCounter += 1;
      employeeSeeds.push({
        companyId: plan.company.id,
        branchId: hq(plan.company.id).id,
        userId: isLinked ? employeeUserIds[isLinked] : null,
        shiftId: companyShifts[i % companyShifts.length].id,
        employeeCode: `${plan.prefix}-${empCounter}`,
        fullName: `${first} ${last}`,
        email,
        phone: `+233 2${(i % 9)} ${String(1000000 + Math.floor(rnd() * 8999999)).slice(0, 7)}`,
        department: plan.departments[i % plan.departments.length],
        jobTitle: i % 4 === 0 ? "Manager" : i % 3 === 0 ? "Officer" : "Analyst",
        homeAddress: `${zone[0]}, Accra - house ${10 + i}`,
        homeLat: zone[1] + (rnd() - 0.5) * 0.02,
        homeLng: zone[2] + (rnd() - 0.5) * 0.02,
        zone: zone[0],
        vip: i === 0,
      });
    }
  });
  const employeeRows = await db.insert(employees).values(employeeSeeds).returning({
    id: employees.id,
    companyId: employees.companyId,
    fullName: employees.fullName,
    zone: employees.zone,
    homeLat: employees.homeLat,
    homeLng: employees.homeLng,
    shiftId: employees.shiftId,
    vip: employees.vip,
  });

  /* --------------------------------------------------------------- stops */
  const stopValues = ZONES.map(([name, lat, lng]) => ({
    companyId: cSikaman.id,
    name: `${name} Junction`,
    zone: name,
    address: `${name}, Accra`,
    lat,
    lng,
  }));
  const stopRows = await db.insert(stops).values(stopValues).returning({ id: stops.id, name: stops.name, zone: stops.zone, lat: stops.lat, lng: stops.lng });

  /* -------------------------------------------------------------- routes */
  const routeValues = [
    { companyId: cSikaman.id, branchId: hq(cSikaman.id).id, name: "SFS Morning - Western Corridor", direction: "home_to_office" as const, zone: "Dansoman/Lapaz", estimatedKm: 24, estimatedMinutes: 75 },
    { companyId: cSikaman.id, branchId: hq(cSikaman.id).id, name: "SFS Morning - Eastern Corridor", direction: "home_to_office" as const, zone: "Madina/Adenta", estimatedKm: 28, estimatedMinutes: 80 },
    { companyId: cSikaman.id, branchId: hq(cSikaman.id).id, name: "SFS Evening Drop-off - Western", direction: "office_to_home" as const, zone: "Dansoman/Lapaz", estimatedKm: 25, estimatedMinutes: 85 },
    { companyId: cTech.id, branchId: hq(cTech.id).id, name: "ATH Morning - Spintex", direction: "home_to_office" as const, zone: "Spintex", estimatedKm: 19, estimatedMinutes: 55 },
    { companyId: cTech.id, branchId: hq(cTech.id).id, name: "ATH Night Drop-off - City", direction: "office_to_home" as const, zone: "Airport Residential", estimatedKm: 14, estimatedMinutes: 40 },
    { companyId: cVolta.id, branchId: hq(cVolta.id).id, name: "VFM Plant Day Pickup - Tema", direction: "home_to_office" as const, zone: "Tema", estimatedKm: 22, estimatedMinutes: 60 },
    { companyId: cVolta.id, branchId: hq(cVolta.id).id, name: "VFM Plant Night Drop-off", direction: "office_to_home" as const, zone: "Tema/Ashaiman", estimatedKm: 23, estimatedMinutes: 65 },
  ];
  const routeRows = await db.insert(routes).values(routeValues).returning({ id: routes.id, name: routes.name, companyId: routes.companyId, direction: routes.direction, estimatedKm: routes.estimatedKm, estimatedMinutes: routes.estimatedMinutes });

  const routeStopValues: Array<typeof routeStops.$inferInsert> = [];
  routeRows.forEach((route, idx) => {
    const picked = stopRows.slice(idx % 3, (idx % 3) + 4);
    picked.forEach((stop, i) =>
      routeStopValues.push({ routeId: route.id, stopId: stop.id, sequence: i + 1, offsetMinutes: i * 9 }),
    );
  });
  await db.insert(routeStops).values(routeStopValues);

  /* ------------------------------------------------------------- vehicles */
  const vehicleSpecs = [
    ["GR-4521-24", "Toyota", "Hiace", 2022, 14, "minibus", "diesel", "owned", 0.9, 128000],
    ["GR-8830-23", "Nissan", "Urvan", 2021, 15, "minibus", "diesel", "owned", 0.95, 165400],
    ["GR-1190-25", "Toyota", "Coaster", 2024, 24, "bus", "diesel", "leased", 1.25, 42000],
    ["GR-7742-22", "Mercedes-Benz", "Sprinter", 2021, 18, "bus", "diesel", "owned", 1.15, 188900],
    ["GR-2265-24", "Toyota", "Corolla", 2023, 4, "sedan", "petrol", "owned", 0.55, 61200],
    ["GR-9911-23", "Toyota", "Rav4", 2022, 4, "suv", "petrol", "contracted", 0.75, 74500],
    ["GR-3301-25", "Ford", "Transit", 2025, 12, "van", "diesel", "leased", 1.0, 18400],
    ["GR-6640-21", "Toyota", "Hiace", 2020, 14, "minibus", "diesel", "owned", 0.9, 210300],
    ["GR-5512-24", "Isuzu", "NPR Bus", 2023, 30, "bus", "diesel", "owned", 1.4, 96800],
    ["GR-8007-25", "Kia", "Grandbird", 2025, 33, "bus", "diesel", "leased", 1.5, 12500],
    ["GR-1234-20", "Toyota", "Hiace", 2019, 14, "minibus", "diesel", "owned", 0.9, 265000],
    ["GR-4555-23", "Nissan", "Patrol", 2022, 6, "suv", "petrol", "contracted", 0.85, 88300],
  ];
  const vehicleRows = await db
    .insert(vehicles)
    .values(
      vehicleSpecs.map((v, i) => ({
        registrationNo: v[0] as string,
        make: v[1] as string,
        model: v[2] as string,
        year: v[3] as number,
        capacity: v[4] as number,
        vehicleType: v[5] as string,
        fuelType: v[6] as string,
        ownership: v[7] as string,
        costPerKm: String(v[8]),
        odometerKm: v[9] as number,
        avgKmPerLitre: 7 + (i % 4),
        assignedCompanyId: i < 5 ? cSikaman.id : i < 8 ? cTech.id : cVolta.id,
        status: (i === 10 ? "under_maintenance" : i === 11 ? "available" : "available") as "under_maintenance" | "available",
        insuranceExpiry: dayIso(30 + i * 25),
        roadworthinessExpiry: dayIso(15 + i * 30),
        registrationExpiry: dayIso(120 + i * 20),
      })),
    )
    .returning({ id: vehicles.id, registrationNo: vehicles.registrationNo, capacity: vehicles.capacity, status: vehicles.status, costPerKm: vehicles.costPerKm });

  /* -------------------------------------------------------------- drivers */
  const driverSpecs = [
    ["Kwesi Appiah", "+233 24 888 0001", "driver.kwesi@staffridegh.com", "B/ACC/019283", "D", 4.8],
    ["Abena Darko", "+233 24 888 0002", "driver.abena@staffridegh.com", "B/ACC/028374", "D", 4.6],
    ["Yaw Frimpong", "+233 20 411 2233", null, "B/ACC/038475", "C", 4.4],
    ["Kojo Anim", "+233 20 411 3344", null, "B/ACC/048576", "D", 4.9],
    ["Mavis Tetteh", "+233 20 411 4455", null, "B/ACC/058677", "D", 4.2],
    ["Ibrahim Musah", "+233 20 411 5566", null, "B/ACC/068778", "C", 4.7],
    ["Selorm Agbevi", "+233 20 411 6677", null, "B/ACC/078879", "D", 4.5],
    ["Bright Nyarko", "+233 20 411 7788", null, "B/ACC/088980", "D", 4.1],
    ["Akua Danso", "+233 20 411 8899", null, "B/ACC/098981", "D", 4.6],
    ["Elikem Doe", "+233 20 411 9900", null, "B/ACC/108982", "C", 4.3],
  ];
  const driverRows = await db
    .insert(drivers)
    .values(
      driverSpecs.map((d, i) => ({
        userId: d[2] ? userBy(d[2] as string).id : null,
        fullName: d[0] as string,
        phone: d[1] as string,
        email: (d[2] as string | null) ?? `${(d[0] as string).split(" ")[0].toLowerCase()}.${(d[0] as string).split(" ")[1].toLowerCase()}@staffridegh.com`,
        licenseNo: d[3] as string,
        licenseClass: d[4] as string,
        licenseExpiry: dayIso(40 + i * 45),
        status: "available" as const,
        baseSalary: String(1400 + i * 40),
        tripAllowance: String(35),
        ratingAvg: d[5] as number,
        ratingCount: 20 + i * 3,
        emergencyContactName: "Family contact",
        emergencyContactPhone: "+233 24 000 000" + i,
        hiredAt: dayIso(-500 - i * 30),
      })),
    )
    .returning({ id: drivers.id, fullName: drivers.fullName, userId: drivers.userId, status: drivers.status });

  // link default driver -> vehicle
  for (let i = 0; i < 10; i++) {
    await db.update(vehicles).set({ assignedDriverId: driverRows[i].id }).where(eq(vehicles.id, vehicleRows[i].id));
  }

  await db.insert(driverShifts).values(
    driverRows.flatMap((d, i) =>
      ["morning", "evening"].map((label) => ({
        driverId: d.id,
        shiftDate: dayIso(0),
        label,
        startTime: label === "morning" ? "04:30" : "15:30",
        endTime: label === "morning" ? "12:30" : "23:30",
        status: "planned",
      })),
    ),
  );

  await db.insert(maintenanceRecords).values([
    { vehicleId: vehicleRows[10].id, type: "repair", description: "Gearbox overhaul and clutch replacement", cost: "6800.00", odometerKm: 263400, serviceDate: dayIso(-6), nextServiceDate: dayIso(24), garageName: "Accra Auto Works", status: "in_progress" },
    { vehicleId: vehicleRows[1].id, type: "preventive", description: "Full service, oil and filters", cost: "1250.00", odometerKm: 163100, serviceDate: dayIso(-40), nextServiceDate: dayIso(20), garageName: "Nissan Service Centre", status: "completed" },
    { vehicleId: vehicleRows[3].id, type: "inspection", description: "Roadworthiness safety inspection", cost: "420.00", odometerKm: 187500, serviceDate: dayIso(-15), nextServiceDate: dayIso(75), garageName: "DVLA Accra", status: "completed" },
    { vehicleId: vehicleRows[0].id, type: "preventive", description: "Brake pads and tyre rotation", cost: "980.00", odometerKm: 127800, serviceDate: dayIso(-70), nextServiceDate: dayIso(-10), garageName: "Toyota Ghana", status: "completed" },
  ]);

  /* -------------------------------------------------------- agreements */
  await db.insert(serviceAgreements).values([
    { companyId: cSikaman.id, name: "Sikaman 2026 Staff Transport SLA", pricingModel: "per_passenger" as const, unitRate: "18.50", startDate: dayIso(-180), endDate: dayIso(180), slaOnTimePercent: 96, slaResponseMinutes: 10, maxPickupDeviationMinutes: 8, cancellationPolicyHours: 2 },
    { companyId: cTech.id, name: "Accra Tech Hub Distance Contract", pricingModel: "distance_based" as const, unitRate: "7.20", startDate: dayIso(-120), endDate: dayIso(240), slaOnTimePercent: 94, slaResponseMinutes: 15, maxPickupDeviationMinutes: 10, cancellationPolicyHours: 3 },
    { companyId: cVolta.id, name: "Volta Foods Monthly Retainer", pricingModel: "monthly_fixed" as const, unitRate: "0", fixedMonthlyAmount: "56000.00", startDate: dayIso(-200), endDate: dayIso(160), slaOnTimePercent: 92, slaResponseMinutes: 20, maxPickupDeviationMinutes: 12, cancellationPolicyHours: 4 },
  ]);

  /* --------------------------------------------------- trips & bookings */
  type TripInsert = typeof trips.$inferInsert;
  const tripInserts: TripInsert[] = [];
  const manifest: Array<{ tripIndex: number; employeeIds: number[] }> = [];

  const companyRoutes = (companyId: number) => routeRows.filter((r) => r.companyId === companyId);
  const employeesOf = (companyId: number) => employeeRows.filter((e) => e.companyId === companyId);

  let tripCounter = 0;
  // history: last 12 days
  for (let dayOffset = -12; dayOffset <= 1; dayOffset++) {
    const iso = dayIso(dayOffset);
    for (const company of companyRows) {
      const routes = companyRoutes(company.id);
      const staff = employeesOf(company.id);
      routes.forEach((route, ri) => {
        const busVehicle = vehicleRows[(tripCounter + ri) % 10];
        const driver = driverRows[(tripCounter + ri) % driverRows.length];
        const departureHour = route.direction === "home_to_office" ? 5 : 17;
        const scheduled = at(iso, departureHour + ri, 30);
        const arrival = at(iso, route.direction === "home_to_office" ? 7 : 19, 0);
        const completed = dayOffset < 0;
        const running = dayOffset === 0 && ri === 0;
        tripCounter += 1;
        const passengers = staff.slice(ri * 4, ri * 4 + Math.min(busVehicle.capacity, 4 + (ri % 3)));
        tripInserts.push({
          reference: `TRP-${iso.replace(/-/g, "").slice(4)}${String(tripCounter).padStart(3, "0")}`,
          companyId: company.id,
          branchId: hq(company.id).id,
          routeId: route.id,
          vehicleId: busVehicle.id,
          driverId: driver.id,
          direction: route.direction,
          tripDate: iso,
          scheduledDeparture: scheduled,
          scheduledArrival: arrival,
          actualDeparture: completed || running ? new Date(scheduled.getTime() + (ri % 2 === 0 ? 4 : 18) * 60000) : null,
          actualArrival: completed ? new Date(arrival.getTime() + (ri % 3 === 0 ? 6 : 22) * 60000) : null,
          status: completed ? "completed" : running ? "in_progress" : "scheduled",
          capacity: busVehicle.capacity,
          bookedSeats: passengers.length,
          plannedKm: route.estimatedKm ?? 20,
          createdById: userBy("dispatch@staffridegh.com").id,
        });
        manifest.push({ tripIndex: tripInserts.length - 1, employeeIds: passengers.map((p) => p.id) });
      });
    }
  }
  const tripRows = await db.insert(trips).values(tripInserts).returning({ id: trips.id, reference: trips.reference, tripDate: trips.tripDate, status: trips.status, direction: trips.direction, scheduledDeparture: trips.scheduledDeparture, companyId: trips.companyId, routeId: trips.routeId, bookedSeats: trips.bookedSeats, vehicleId: trips.vehicleId, driverId: trips.driverId, capacity: trips.capacity });

  type BookingInsert = typeof bookings.$inferInsert;
  const bookingInserts: BookingInsert[] = [];
  const bookingMeta: Array<{ employeeId: number; tripId: number; status: string; date: string; direction: string }> = [];

  manifest.forEach(({ tripIndex, employeeIds }) => {
    const trip = tripRows[tripIndex];
    employeeIds.forEach((employeeId, i) => {
      const employee = employeeRows.find((e) => e.id === employeeId)!;
      const status =
        trip.status === "completed" ? (i === 0 && tripIndex % 7 === 0 ? "no_show" : "completed") : trip.status === "in_progress" ? "in_progress" : "assigned";
      bookingInserts.push({
        reference: `BKG-${trip.reference.slice(4)}-${String(i + 1).padStart(2, "0")}`,
        companyId: trip.companyId,
        employeeId,
        tripId: trip.id,
        routeId: trip.routeId,
        direction: trip.direction,
        bookingDate: trip.tripDate,
        pickupAddress: employee.zone,
        dropoffAddress: trip.direction === "home_to_office" ? "Office" : employee.zone,
        pickupTime: trip.direction === "home_to_office" ? "05:45" : "17:15",
        requestedTime: trip.direction === "home_to_office" ? "06:00" : "17:00",
        seats: 1,
        status: status as typeof bookings.$inferInsert.status,
        recurring: "daily" as const,
        otpCode: String(100000 + ((trip.id * 7 + i * 13) % 899999)),
        vip: employee.vip,
        approvedById: userBy("dispatch@staffridegh.com").id,
      });
      bookingMeta.push({ employeeId, tripId: trip.id, status, date: trip.tripDate, direction: trip.direction });
    });
  });

  // pending + waitlisted requests for today / tomorrow
  const pendingEmployees = employeesOf(cSikaman.id).slice(4, 8);
  pendingEmployees.forEach((emp, i) => {
    const direction = i % 2 === 0 ? "home_to_office" : "office_to_home";
    bookingInserts.push({
      reference: `BKG-PENDING-${String(i + 1).padStart(3, "0")}`,
      companyId: emp.companyId,
      employeeId: emp.id,
      routeId: companyRoutes(emp.companyId)[0]?.id ?? null,
      direction,
      bookingDate: dayIso(i < 2 ? 0 : 1),
      pickupAddress: emp.zone,
      dropoffAddress: direction === "home_to_office" ? "Head Office" : emp.zone,
      requestedTime: direction === "home_to_office" ? "06:30" : "17:30",
      seats: 1,
      status: i === 3 ? "waitlisted" : "pending",
      recurring: "none" as const,
      otpCode: String(200000 + i * 1111),
      notes: i === 0 ? "Client meeting in the morning, earliest pickup possible." : null,
    });
  });

  // a cancelled booking and a rejected one for reporting completeness
  const cancelledEmployee = employeesOf(cTech.id)[5];
  bookingInserts.push({
    reference: "BKG-CANCEL-0001",
    companyId: cTech.id,
    employeeId: cancelledEmployee.id,
    routeId: companyRoutes(cTech.id)[0].id,
    direction: "home_to_office",
    bookingDate: dayIso(-2),
    pickupAddress: cancelledEmployee.zone,
    dropoffAddress: "One Airport Square",
    seats: 1,
    status: "cancelled",
    recurring: "none",
    cancelReason: "Employee travelled for assignment",
    cancelledAt: at(dayIso(-3), 9, 12),
    otpCode: "300001",
  });

  const bookingRows = await db.insert(bookings).values(bookingInserts).returning({ id: bookings.id, tripId: bookings.tripId, employeeId: bookings.employeeId, status: bookings.status, otpCode: bookings.otpCode, reference: bookings.reference });

  /* ---------------------------------------------------------- boardings */
  const boardingValues: Array<typeof boardings.$inferInsert> = [];
  bookingRows.forEach((b) => {
    if (!b.tripId) return;
    if (b.status === "completed") {
      boardingValues.push({ bookingId: b.id, tripId: b.tripId, boardedAt: new Date(), otpVerified: true });
    } else if (b.status === "no_show") {
      boardingValues.push({ bookingId: b.id, tripId: b.tripId, noShow: true, note: "Passenger not at pickup point after 5 minutes" });
    } else if (b.status === "in_progress") {
      boardingValues.push({ bookingId: b.id, tripId: b.tripId, boardedAt: new Date(), otpVerified: true });
    }
  });
  if (boardingValues.length) await db.insert(boardings).values(boardingValues);

  /* -------------------------------------------------------- GPS history */
  const runningTrips = tripRows.filter((t) => t.status === "in_progress");
  const gpsValues: Array<typeof gpsEvents.$inferInsert> = [];
  runningTrips.forEach((trip) => {
    const branch = branchRows.find((b) => b.companyId === trip.companyId)!;
    for (let step = 0; step < 8; step++) {
      gpsValues.push({
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        lat: (branch.lat ?? 5.6) + 0.01 * step - 0.04,
        lng: (branch.lng ?? -0.18) + 0.008 * step - 0.03,
        speedKph: 18 + step,
        heading: 45,
        source: "simulated_demo",
        recordedAt: new Date(Date.now() - (8 - step) * 60000),
      });
    }
  });
  if (gpsValues.length) await db.insert(gpsEvents).values(gpsValues);

  /* ------------------------------------------------------------ finance */
  const previousMonthStart = dayIso(-45);
  const previousMonthEnd = dayIso(-15);
  const invoiceValues = companyRows.map((company, i) => ({
    companyId: company.id,
    invoiceNo: `INV-2026-${String(i + 1).padStart(4, "0")}`,
    periodStart: previousMonthStart,
    periodEnd: previousMonthEnd,
    subtotal: String([18600, 14250, 56000][i]),
    tax: String([2790, 2137.5, 8400][i]),
    discount: "0",
    total: String([21390, 16387.5, 64400][i]),
    amountPaid: String(i === 0 ? 21390 : i === 1 ? 8000 : 0),
    status: (i === 0 ? "paid" : i === 1 ? "partial" : "overdue") as "paid" | "partial" | "overdue",
    issuedAt: at(previousMonthEnd, 10, 0),
    dueDate: dayIso(-5),
    notes: "Monthly staff transportation services",
  }));
  const invoiceRows = await db.insert(invoices).values(invoiceValues).returning({ id: invoices.id, companyId: invoices.companyId, invoiceNo: invoices.invoiceNo });

  await db.insert(invoiceLines).values(
    invoiceRows.flatMap((inv) => [
      { invoiceId: inv.id, description: "Morning pickup trips (home to office)", category: "transport", quantity: "22", unitPrice: "450.00", amount: "9900.00" },
      { invoiceId: inv.id, description: "Evening drop-off trips (office to home)", category: "transport", quantity: "22", unitPrice: "420.00", amount: "9240.00" },
      { invoiceId: inv.id, description: "Ad-hoc / emergency transport", category: "extra", quantity: "6", unitPrice: "120.00", amount: "720.00" },
    ]),
  );

  await db.insert(payments).values([
    { companyId: cSikaman.id, invoiceId: invoiceRows[0].id, amount: "21390.00", method: "bank_transfer" as const, reference: "TRF-9912001", status: "successful" as const, paidAt: at(dayIso(-10), 11, 30), recordedById: userBy("finance@staffridegh.com").id },
    { companyId: cTech.id, invoiceId: invoiceRows[1].id, amount: "8000.00", method: "mobile_money" as const, reference: "MOMO-77213", status: "successful" as const, paidAt: at(dayIso(-8), 14, 5), recordedById: userBy("finance@staffridegh.com").id },
  ]);

  const completedTrips = tripRows.filter((t) => t.status === "completed");
  await db.insert(driverEarnings).values(
    completedTrips.slice(0, 60).map((t) => {
      const base = 85;
      const overtime = (t.id % 5) * 12;
      return {
        driverId: t.driverId!,
        tripId: t.id,
        periodStart: dayIso(-30),
        periodEnd: dayIso(0),
        basePay: String(base),
        overtimePay: String(overtime),
        allowance: "35.00",
        deduction: "0",
        total: String(base + overtime + 35),
        status: (t.id % 3 === 0 ? "approved" : "accrued") as "approved" | "accrued",
      };
    }),
  );

  /* ---------------------------------------------------------- incidents */
  await db.insert(incidents).values([
    { companyId: cSikaman.id, tripId: tripRows[0]?.id ?? null, vehicleId: vehicleRows[0].id, driverId: driverRows[0].id, reportedById: userBy("driver.kwesi@staffridegh.com").id, type: "breakdown" as const, severity: "high" as const, status: "resolved" as const, description: "Alternator failure on Ring Road, vehicle could not restart.", actionTaken: "Replacement vehicle GR-7742-22 dispatched within 18 minutes, passengers transferred.", location: "Ring Road East", resolvedAt: at(dayIso(-4), 8, 15) },
    { companyId: cTech.id, vehicleId: vehicleRows[6].id, driverId: driverRows[6].id, reportedById: userBy("dispatch@staffridegh.com").id, type: "delay" as const, severity: "medium" as const, status: "acknowledged" as const, description: "Heavy traffic on Spintex road, pickup running 25 minutes late.", location: "Spintex Road" },
    { companyId: cVolta.id, vehicleId: vehicleRows[9].id, driverId: driverRows[8].id, reportedById: userBy("dispatch@staffridegh.com").id, type: "accident" as const, severity: "critical" as const, status: "open" as const, description: "Minor collision with a motorcycle at Ashaiman roundabout. No staff injuries.", location: "Ashaiman Roundabout" },
    { companyId: cSikaman.id, tripId: tripRows[1]?.id ?? null, driverId: driverRows[1].id, reportedById: userBy("dispatch@staffridegh.com").id, type: "no_show" as const, severity: "low" as const, status: "resolved" as const, description: "Passenger not present at Dansoman junction pickup point.", actionTaken: "Driver waited 5 minutes then continued route; passenger informed of policy." },
  ]);

  await db.insert(feedback).values([
    { companyId: cSikaman.id, employeeId: employeeRows[0].id, tripId: completedTrips[0]?.id ?? null, category: "feedback", rating: 5, comments: "Driver was punctual and the vehicle was clean." },
    { companyId: cSikaman.id, employeeId: employeeRows[1].id, tripId: completedTrips[1]?.id ?? null, category: "complaint", rating: 2, comments: "Pickup was 20 minutes later than the stated time.", status: "addressed" },
    { companyId: cTech.id, employeeId: employeeRows[15]?.id ?? employeeRows[14].id, category: "feedback", rating: 4, comments: "Good service overall, would like more evening trips." },
  ]);

  await db.insert(notifications).values([
    { userId: userBy("ama@sikamanfinancial.com").id, companyId: cSikaman.id, channel: "in_app", category: "booking", title: "Pickup confirmed for tomorrow 05:45", body: "Vehicle Toyota Hiace GR-4521-24, driver Kwesi Appiah.", tripId: runningTrips[0]?.id ?? null },
    { userId: userBy("dispatch@staffridegh.com").id, channel: "in_app", category: "incident", title: "Critical: accident reported at Ashaiman", body: "Volta Foods night trip affected. Review incident record." },
    { userId: userBy("hr@sikamanfinancial.com").id, companyId: cSikaman.id, channel: "in_app", category: "invoice", title: "Invoice INV-2026-0001 settled", body: "Payment of GHS 21,390.00 received by bank transfer." },
  ]);

  await db.insert(auditLogs).values([
    { userId: userBy("admin@staffridegh.com").id, actorEmail: "admin@staffridegh.com", action: "seed.demo_data", entity: "system", details: { companies: companyRows.length, employees: employeeRows.length, trips: tripRows.length } },
    { userId: userBy("ops@staffridegh.com").id, actorEmail: "ops@staffridegh.com", action: "trip.dispatch", entity: "trip", entityId: String(tripRows[0]?.id ?? ""), companyId: cSikaman.id, details: { vehicle: vehicleRows[0].registrationNo, driver: driverRows[0].fullName } },
    { userId: userBy("fleet@staffridegh.com").id, actorEmail: "fleet@staffridegh.com", action: "maintenance.create", entity: "vehicle", entityId: String(vehicleRows[10].id), details: { type: "repair" } },
  ]);

  /* ------------------------------- normalised roles, addresses, assignments */
  await ensureExtendedSeeded();
}
