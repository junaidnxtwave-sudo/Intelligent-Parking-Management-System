import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CancelParkingReservationParams,
  CancelParkingReservationResponse,
  CreateParkingReservationBody,
  CreateParkingReservationResponse,
  GetParkingActivityResponse,
  GetParkingDashboardResponse,
  GetParkingLotParams,
  GetParkingLotResponse,
  GetParkingLotsQueryParams,
  GetParkingLotsResponse,
  GetParkingReservationsQueryParams,
  GetParkingReservationsResponse,
  GetParkingSessionResponse,
  UpdateParkingOccupancyBody,
  UpdateParkingOccupancyParams,
  UpdateParkingOccupancyResponse,
} from "@workspace/api-zod";
import {
  db,
  occupancyReadingsTable,
  parkingActivityTable,
  parkingLotsTable,
  parkingReservationsTable,
} from "@workspace/db";
import {
  getOperatorIdentity,
  getParkingIdentity,
} from "../middlewares/parkingAuth";

const router: IRouter = Router();
const reservationStatuses = ["reserved", "active"] as const;

type LotRow = typeof parkingLotsTable.$inferSelect;
type ReservationStatus =
  | "reserved"
  | "active"
  | "completed"
  | "cancelled";

function toLotResponse(
  lot: LotRow,
  availableSpaces: number,
): Record<string, unknown> {
  return {
    id: lot.id,
    name: lot.name,
    address: lot.address,
    area: lot.area,
    distanceKm: lot.distanceKm,
    totalSpaces: lot.totalSpaces,
    occupiedSpaces: lot.occupiedSpaces,
    availableSpaces,
    hourlyRate: lot.hourlyRate,
    amenities: lot.amenities,
    isOpen: lot.isOpen,
    latitude: lot.latitude,
    longitude: lot.longitude,
    updatedAt: lot.updatedAt.toISOString(),
  };
}

function reservationStatus(
  storedStatus: ReservationStatus,
  startsAt: Date,
  endsAt: Date,
  now = new Date(),
): ReservationStatus {
  if (storedStatus === "cancelled") return "cancelled";
  if (endsAt <= now) return "completed";
  if (startsAt <= now) return "active";
  return "reserved";
}

function kolkataDayStart(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+05:30`,
  );
}

function toReservationResponse(
  reservation: typeof parkingReservationsTable.$inferSelect,
  lotName: string,
) {
  return {
    id: reservation.id,
    lotId: reservation.lotId,
    lotName,
    driverName: reservation.driverName,
    email: reservation.email,
    vehiclePlate: reservation.vehiclePlate,
    startsAt: reservation.startsAt.toISOString(),
    endsAt: reservation.endsAt.toISOString(),
    durationHours: reservation.durationHours,
    status: reservationStatus(
      reservation.status,
      reservation.startsAt,
      reservation.endsAt,
    ),
    totalPrice: reservation.totalPrice,
    confirmationCode: reservation.confirmationCode,
    createdAt: reservation.createdAt.toISOString(),
  };
}

async function getAvailableSpaces(
  lot: LotRow,
  start?: Date,
  end?: Date,
) {
  if (!start || !end) {
    return Math.max(0, lot.totalSpaces - lot.occupiedSpaces);
  }
  const now = new Date();
  const activeBookings = await db
    .select({ id: parkingReservationsTable.id })
    .from(parkingReservationsTable)
    .where(
      and(
        eq(parkingReservationsTable.lotId, lot.id),
        eq(parkingReservationsTable.status, "reserved"),
        lt(parkingReservationsTable.startsAt, end),
        gt(parkingReservationsTable.endsAt, start),
        // The live sensor already counts cars that have arrived.
        ...(start <= now ? [gt(parkingReservationsTable.startsAt, now)] : []),
      ),
    );
  return Math.max(
    0,
    lot.totalSpaces - lot.occupiedSpaces - activeBookings.length,
  );
}

async function findLot(id: number) {
  const [lot] = await db
    .select()
    .from(parkingLotsTable)
    .where(eq(parkingLotsTable.id, id))
    .limit(1);
  return lot;
}

router.get("/parking/lots", async (req, res): Promise<void> => {
  const parsed = GetParkingLotsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const params = parsed.data;
  const lots = await db.select().from(parkingLotsTable);
  const results = await Promise.all(
    lots.map(async (lot) => ({
      lot,
      availableSpaces: await getAvailableSpaces(lot),
    })),
  );
  const query = params.q?.trim().toLocaleLowerCase();
  const filtered = results.filter(({ lot, availableSpaces }) => {
    const matchesQuery =
      !query ||
      `${lot.name} ${lot.address} ${lot.area}`
        .toLocaleLowerCase()
        .includes(query);
    return (
      matchesQuery &&
      (!params.availableOnly || (lot.isOpen && availableSpaces > 0))
    );
  });

  if (params.sort === "price") {
    filtered.sort((a, b) => a.lot.hourlyRate - b.lot.hourlyRate);
  } else if (params.sort === "availability") {
    filtered.sort((a, b) => b.availableSpaces - a.availableSpaces);
  } else {
    filtered.sort(
      (a, b) => a.lot.distanceKm - b.lot.distanceKm,
    );
  }

  res.json(
    GetParkingLotsResponse.parse(
      filtered.map(({ lot, availableSpaces }) =>
        toLotResponse(lot, availableSpaces),
      ),
    ),
  );
});

router.get("/parking/lots/:id", async (req, res): Promise<void> => {
  const params = GetParkingLotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const lot = await findLot(params.data.id);
  if (!lot) {
    res.status(404).json({ error: "Parking lot not found" });
    return;
  }

  res.json(
    GetParkingLotResponse.parse({
      ...toLotResponse(lot, await getAvailableSpaces(lot)),
    }),
  );
});

router.put(
  "/parking/lots/:id/occupancy",
  async (req, res): Promise<void> => {
    const identity = await getOperatorIdentity(req, res);
    if (!identity) return;
    const params = UpdateParkingOccupancyParams.safeParse(req.params);
    const body = UpdateParkingOccupancyBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const lot = await findLot(params.data.id);
    if (!lot) {
      res.status(404).json({ error: "Parking lot not found" });
      return;
    }
    if (
      body.data.occupiedSpaces < 0 ||
      body.data.occupiedSpaces > lot.totalSpaces
    ) {
      res.status(400).json({
        error: `Occupied spaces must be between 0 and ${lot.totalSpaces}`,
      });
      return;
    }

    const now = new Date();
    const [updatedLot] = await db
      .update(parkingLotsTable)
      .set({ occupiedSpaces: body.data.occupiedSpaces, updatedAt: now })
      .where(eq(parkingLotsTable.id, lot.id))
      .returning();

    await db.insert(occupancyReadingsTable).values({
      lotId: lot.id,
      occupiedSpaces: body.data.occupiedSpaces,
      recordedAt: now,
    });
    await db.insert(parkingActivityTable).values({
      type: "occupancy_updated",
      lotName: lot.name,
      message: `${lot.name} occupancy updated to ${body.data.occupiedSpaces} of ${lot.totalSpaces} spaces.`,
      createdAt: now,
    });

    res.json(
      UpdateParkingOccupancyResponse.parse({
        ...toLotResponse(
          updatedLot,
          await getAvailableSpaces(updatedLot),
        ),
      }),
    );
  },
);

router.get("/parking/me", async (req, res): Promise<void> => {
  const identity = await getParkingIdentity(req, res);
  if (!identity) return;
  res.json(GetParkingSessionResponse.parse(identity));
});

router.get("/parking/reservations", async (req, res): Promise<void> => {
  const identity = await getParkingIdentity(req, res);
  if (!identity) return;
  const parsed = GetParkingReservationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const baseQuery = db
    .select({
      reservation: parkingReservationsTable,
      lotName: parkingLotsTable.name,
    })
    .from(parkingReservationsTable)
    .innerJoin(
      parkingLotsTable,
      eq(parkingReservationsTable.lotId, parkingLotsTable.id),
    );
  const rows =
    identity.role === "operator"
      ? await baseQuery.orderBy(desc(parkingReservationsTable.createdAt))
      : await baseQuery
          .where(eq(parkingReservationsTable.clerkUserId, identity.userId))
          .orderBy(desc(parkingReservationsTable.createdAt));
  const now = new Date();
  const filtered = rows.filter(({ reservation }) => {
    const status = reservationStatus(
      reservation.status,
      reservation.startsAt,
      reservation.endsAt,
      now,
    );
    return !parsed.data.status || parsed.data.status === status;
  });

  res.json(
    GetParkingReservationsResponse.parse(
      filtered.map(({ reservation, lotName }) =>
        toReservationResponse(reservation, lotName),
      ),
    ),
  );
});

router.post("/parking/reservations", async (req, res): Promise<void> => {
  const identity = await getParkingIdentity(req, res);
  if (!identity) return;
  const parsed = CreateParkingReservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const lot = await findLot(input.lotId);
  if (!lot) {
    res.status(404).json({ error: "Parking lot not found" });
    return;
  }
  if (!lot.isOpen) {
    res.status(400).json({ error: "This parking lot is currently closed" });
    return;
  }

  const now = new Date();
  const startsAt = new Date(input.startsAt);
  if (startsAt.getTime() < now.getTime() - 5 * 60 * 1000) {
    res.status(400).json({ error: "Start time cannot be in the past" });
    return;
  }
  const endsAt = new Date(
    startsAt.getTime() + input.durationHours * 60 * 60 * 1000,
  );
  const availableSpaces = await getAvailableSpaces(lot, startsAt, endsAt);
  if (availableSpaces < 1) {
    res.status(409).json({
      error: "No spaces are available for the selected time",
    });
    return;
  }

  const [reservation] = await db
    .insert(parkingReservationsTable)
    .values({
      lotId: lot.id,
      clerkUserId: identity.userId,
      driverName: identity.displayName,
      email: identity.email,
      vehiclePlate: input.vehiclePlate.trim().toLocaleUpperCase(),
      startsAt,
      endsAt,
      durationHours: input.durationHours,
      status: startsAt <= now ? "active" : "reserved",
      totalPrice: Math.round(lot.hourlyRate * input.durationHours * 100) / 100,
      confirmationCode: randomBytes(3).toString("hex").toUpperCase(),
    })
    .returning();

  await db.insert(parkingActivityTable).values({
    type: "reservation_created",
    lotName: lot.name,
    message: `${identity.displayName} reserved a space at ${lot.name}.`,
  });

  res.status(201).json(
    CreateParkingReservationResponse.parse(
      toReservationResponse(reservation, lot.name),
    ),
  );
});

router.patch(
  "/parking/reservations/:id/cancel",
  async (req, res): Promise<void> => {
    const identity = await getParkingIdentity(req, res);
    if (!identity) return;
    const params = CancelParkingReservationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [record] = await db
      .select({
        reservation: parkingReservationsTable,
        lotName: parkingLotsTable.name,
      })
      .from(parkingReservationsTable)
      .innerJoin(
        parkingLotsTable,
        eq(parkingReservationsTable.lotId, parkingLotsTable.id),
      )
      .where(eq(parkingReservationsTable.id, params.data.id))
      .limit(1);
    if (!record) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }
    if (
      identity.role !== "operator" &&
      record.reservation.clerkUserId !== identity.userId
    ) {
      res.status(403).json({
        error: "You can only cancel your own parking reservations.",
      });
      return;
    }

    const currentStatus = reservationStatus(
      record.reservation.status,
      record.reservation.startsAt,
      record.reservation.endsAt,
    );
    if (currentStatus === "completed" || currentStatus === "cancelled") {
      res.status(409).json({
        error: "This reservation can no longer be cancelled",
      });
      return;
    }

    const [cancelled] = await db
      .update(parkingReservationsTable)
      .set({ status: "cancelled" })
      .where(eq(parkingReservationsTable.id, params.data.id))
      .returning();
    await db.insert(parkingActivityTable).values({
      type: "reservation_cancelled",
      lotName: record.lotName,
      message: `Reservation ${cancelled.confirmationCode} at ${record.lotName} was cancelled.`,
    });

    res.json(
      CancelParkingReservationResponse.parse(
        toReservationResponse(cancelled, record.lotName),
      ),
    );
  },
);

router.get("/parking/dashboard", async (req, res): Promise<void> => {
  const identity = await getOperatorIdentity(req, res);
  if (!identity) return;
  const now = new Date();
  const lots = await db.select().from(parkingLotsTable);
  const totalSpaces = lots.reduce((sum, lot) => sum + lot.totalSpaces, 0);
  const occupiedSpaces = lots.reduce(
    (sum, lot) => sum + lot.occupiedSpaces,
    0,
  );
  const reservations = await db
    .select()
    .from(parkingReservationsTable)
    .where(
      and(
        gt(parkingReservationsTable.endsAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        sql`${parkingReservationsTable.status} <> 'cancelled'`,
      ),
    );
  const dayStart = kolkataDayStart(now);
  const yesterdayStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
  const revenueToday = reservations
    .filter(
      (reservation) =>
        reservation.createdAt >= dayStart &&
        reservation.createdAt <= now,
    )
    .reduce((total, reservation) => total + reservation.totalPrice, 0);
  const revenueYesterday = reservations
    .filter(
      (reservation) =>
        reservation.createdAt >= yesterdayStart &&
        reservation.createdAt < dayStart,
    )
    .reduce((total, reservation) => total + reservation.totalPrice, 0);
  const occupancyReadings = await db
    .select()
    .from(occupancyReadingsTable)
    .where(gt(occupancyReadingsTable.recordedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))
    .orderBy(occupancyReadingsTable.recordedAt);
  const bucketSize = 4 * 60 * 60 * 1000;
  const bucketValues = new Map<number, number[]>();
  for (const reading of occupancyReadings) {
    const age = now.getTime() - reading.recordedAt.getTime();
    const bucket = Math.min(5, Math.floor(age / bucketSize));
    const values = bucketValues.get(bucket) ?? [];
    values.push(reading.occupiedSpaces);
    bucketValues.set(bucket, values);
  }
  const occupancyTrend = [...bucketValues.entries()]
    .sort(([a], [b]) => b - a)
    .map(([bucket, values]) => {
      const labelTime = new Date(now.getTime() - (bucket + 0.5) * bucketSize);
      const label = labelTime.toLocaleTimeString("en-IN", {
        hour: "numeric",
        hour12: true,
        timeZone: "Asia/Kolkata",
      });
      const occupied = values.reduce((sum, value) => sum + value, 0);
      return {
        label,
        occupancyRate:
          totalSpaces === 0
            ? 0
            : Math.round((occupied / totalSpaces) * 100),
      };
    });
  const revenueTrend = Array.from({ length: 6 }, (_, bucket) => {
    const bucketStart = new Date(now.getTime() - (bucket + 1) * bucketSize);
    const bucketEnd = new Date(now.getTime() - bucket * bucketSize);
    const revenue = reservations
      .filter(
        (reservation) =>
          reservation.createdAt >= bucketStart &&
          reservation.createdAt < bucketEnd,
      )
      .reduce((total, reservation) => total + reservation.totalPrice, 0);
    return {
      label: bucketEnd.toLocaleTimeString("en-IN", {
        hour: "numeric",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }),
      revenue: Math.round(revenue * 100) / 100,
    };
  }).reverse();
  const activeReservations = reservations.filter(
    (reservation) =>
      reservation.status !== "cancelled" &&
      reservation.endsAt > now,
  ).length;

  res.json(
    GetParkingDashboardResponse.parse({
      totalLots: lots.length,
      totalSpaces,
      occupiedSpaces,
      availableSpaces: Math.max(0, totalSpaces - occupiedSpaces),
      occupancyRate:
        totalSpaces === 0
          ? 0
          : Math.round((occupiedSpaces / totalSpaces) * 100),
      activeReservations,
      revenueToday: Math.round(revenueToday * 100) / 100,
      revenueChangePercent:
        revenueYesterday === 0
          ? revenueToday === 0
            ? 0
            : 100
          : Math.round(
              ((revenueToday - revenueYesterday) / revenueYesterday) * 100,
            ),
      occupancyTrend,
      revenueTrend,
    }),
  );
});

router.get("/parking/activity", async (req, res): Promise<void> => {
  const identity = await getOperatorIdentity(req, res);
  if (!identity) return;
  const activity = await db
    .select()
    .from(parkingActivityTable)
    .orderBy(desc(parkingActivityTable.createdAt))
    .limit(12);
  res.json(
    GetParkingActivityResponse.parse(
      activity.map((item) => ({
        id: item.id,
        type: item.type,
        lotName: item.lotName,
        message: item.message,
        createdAt: item.createdAt.toISOString(),
      })),
    ),
  );
});

export default router;
