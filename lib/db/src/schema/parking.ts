import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const reservationStatusEnum = pgEnum("reservation_status", [
  "reserved",
  "active",
  "completed",
  "cancelled",
]);

export const activityTypeEnum = pgEnum("parking_activity_type", [
  "reservation_created",
  "reservation_cancelled",
  "occupancy_updated",
]);

export const parkingLotsTable = pgTable("parking_lots", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  area: text("area").notNull(),
  distanceKm: doublePrecision("distance_km").notNull(),
  totalSpaces: integer("total_spaces").notNull(),
  occupiedSpaces: integer("occupied_spaces").notNull().default(0),
  hourlyRate: doublePrecision("hourly_rate").notNull(),
  amenities: text("amenities").array().notNull().default([]),
  isOpen: boolean("is_open").notNull().default(true),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const parkingReservationsTable = pgTable("parking_reservations", {
  id: serial("id").primaryKey(),
  lotId: integer("lot_id")
    .notNull()
    .references(() => parkingLotsTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id"),
  driverName: text("driver_name").notNull(),
  email: text("email").notNull(),
  vehiclePlate: text("vehicle_plate").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  durationHours: integer("duration_hours").notNull(),
  status: reservationStatusEnum("status").notNull().default("reserved"),
  totalPrice: doublePrecision("total_price").notNull(),
  confirmationCode: text("confirmation_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [index("parking_reservations_clerk_user_idx").on(table.clerkUserId)]);

export const occupancyReadingsTable = pgTable("occupancy_readings", {
  id: serial("id").primaryKey(),
  lotId: integer("lot_id")
    .notNull()
    .references(() => parkingLotsTable.id, { onDelete: "cascade" }),
  occupiedSpaces: integer("occupied_spaces").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const parkingActivityTable = pgTable("parking_activity", {
  id: serial("id").primaryKey(),
  type: activityTypeEnum("type").notNull(),
  lotName: text("lot_name").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertParkingLotSchema = createInsertSchema(
  parkingLotsTable,
).omit({ id: true, updatedAt: true });
export const insertParkingReservationSchema = createInsertSchema(
  parkingReservationsTable,
).omit({ id: true, createdAt: true });
export const insertOccupancyReadingSchema = createInsertSchema(
  occupancyReadingsTable,
).omit({ id: true, recordedAt: true });
export const insertParkingActivitySchema = createInsertSchema(
  parkingActivityTable,
).omit({ id: true, createdAt: true });

export type InsertParkingLot = z.infer<typeof insertParkingLotSchema>;
export type ParkingLot = typeof parkingLotsTable.$inferSelect;
export type InsertParkingReservation = z.infer<
  typeof insertParkingReservationSchema
>;
export type ParkingReservation = typeof parkingReservationsTable.$inferSelect;
export type InsertOccupancyReading = z.infer<
  typeof insertOccupancyReadingSchema
>;
export type OccupancyReading = typeof occupancyReadingsTable.$inferSelect;
export type InsertParkingActivity = z.infer<
  typeof insertParkingActivitySchema
>;
export type ParkingActivity = typeof parkingActivityTable.$inferSelect;
