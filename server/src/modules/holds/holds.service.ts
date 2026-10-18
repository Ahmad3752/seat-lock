import { randomBytes, createHash } from "node:crypto";
import mongoose, { Types, type ClientSession } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { Event } from "../../models/event.model.js";
import { EventSeat } from "../../models/event-seat.model.js";
import { SeatHold, type SeatHoldDocument } from "../../models/seat-hold.model.js";
import { holdInput } from "./holds.validation.js";
import { notifySeatChanges } from "../../realtime/seat-updates.js";

export type PublicHold = {
  id: string;
  status: string;
  expiresAt: Date;
  seats: Array<{ id: string; label: string; price: number }>;
  total: number;
  currency: string;
};

type StoredHold = SeatHoldDocument & { _id: Types.ObjectId };
type CreateHoldInput = { eventId: string; customerId: string; seatIds: string[]; idempotencyKey: string };

function publicHold(hold: StoredHold): PublicHold {
  return {
    id: hold._id.toString(), status: hold.status, expiresAt: hold.expiresAt,
    seats: hold.snapshots.map((seat) => ({ id: seat.seatId.toString(), label: seat.label, price: seat.price })),
    total: hold.total, currency: hold.currency,
  };
}

function unavailable() {
  return new AppError(409, "SEAT_UNAVAILABLE", "One or more selected seats are no longer available.");
}

async function saleEvent(eventId: string, now: Date, session: ClientSession | null = null) {
  const event = await Event.findOneAndUpdate({
    _id: eventId, status: "published", startsAt: { $gt: now },
    $and: [
      { $or: [{ saleStartsAt: null }, { saleStartsAt: { $lte: now } }] },
      { $or: [{ saleEndsAt: null }, { saleEndsAt: { $gt: now } }] },
    ],
  }, { $inc: { __v: 1 } }, { session, returnDocument: "after" }).select("currency").lean();
  if (!event) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  return event;
}

function matchingHold(hold: StoredHold, eventId: string, seatIds: string[]): PublicHold {
  const storedIds = hold.seatIds.map(String).sort();
  const requestedIds = [...seatIds].sort();
  if (hold.eventId.toString() !== eventId || storedIds.length !== requestedIds.length ||
    storedIds.some((id, index) => id !== requestedIds[index])) {
    throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different selection.");
  }
  return publicHold(hold);
}

export async function createSeatHold(input: CreateHoldInput): Promise<PublicHold> {
  const { seatIds, idempotencyKey } = holdInput(input);
  if (!/^[a-f\d]{24}$/i.test(input.eventId)) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  const eventId = input.eventId.toLowerCase();
  const customerId = input.customerId;
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const now = new Date();
      const existing = await SeatHold.findOne({ customerId, idempotencyKey }).session(session).lean();
      if (existing) return { hold: matchingHold(existing, eventId, seatIds), changed: false };
      const event = await saleEvent(eventId, now, session);

      const holdId = new Types.ObjectId();
      const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
      const expiresAt = new Date(now.getTime() + env.holdDurationMinutes * 60_000);
      const result = await EventSeat.updateMany({
        _id: { $in: seatIds }, eventId,
        $or: [{ status: "available" }, { status: "held", holdExpiresAt: { $lte: now } }],
      }, {
        $set: { status: "held", holdId, holdTokenHash: tokenHash, holdExpiresAt: expiresAt },
        $inc: { version: 1 },
      }, { session });
      if (result.modifiedCount !== seatIds.length) throw unavailable();

      const seats = await EventSeat.find({ eventId, _id: { $in: seatIds }, holdId }).session(session).lean();
      const seatsById = new Map(seats.map((seat) => [seat._id.toString(), seat]));
      const snapshots = seatIds.map((id) => {
        const seat = seatsById.get(id)!;
        return { seatId: seat._id, label: seat.label, price: seat.price };
      });
      const hold = new SeatHold({
        _id: holdId, eventId, customerId, seatIds, status: "active", expiresAt, idempotencyKey, tokenHash,
        snapshots, total: snapshots.reduce((total, seat) => total + seat.price, 0), currency: event.currency,
      });
      await hold.save({ session });
      return { hold: publicHold(hold), changed: true };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
    if (result.changed) notifySeatChanges(eventId);
    return result.hold;
  } catch (error) {
    // A concurrent same-key transaction may win the unique-index race on disjoint seats.
    // Read its committed result only after our transaction has rolled back.
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      const existing = await SeatHold.findOne({ customerId, idempotencyKey }).lean();
      if (existing) return matchingHold(existing, eventId, seatIds);
    }
    if (error instanceof mongoose.mongo.MongoServerError &&
      (error.code === 112 || error.hasErrorLabel("TransientTransactionError"))) throw unavailable();
    throw error;
  } finally {
    await session.endSession();
  }
}

async function finishHold(holdId: string, status: "released" | "expired", customerId?: string, now = new Date()): Promise<boolean> {
  if (!Types.ObjectId.isValid(holdId)) throw new AppError(404, "NOT_FOUND", "Hold was not found.");
  const session = await mongoose.startSession();
  try {
    const eventId = await session.withTransaction(async () => {
      const filter: Record<string, unknown> = { _id: holdId };
      if (customerId) filter.customerId = customerId;
      const hold = await SeatHold.findOne(filter).session(session);
      if (!hold) {
        if (customerId) throw new AppError(404, "NOT_FOUND", "Hold was not found.");
        return null;
      }
      if (hold.status !== "active" || (status === "expired" && hold.expiresAt > now)) return null;
      await EventSeat.updateMany({ holdId: hold._id, status: "held" }, {
        $set: { status: "available" },
        $unset: { holdId: 1, holdTokenHash: 1, holdExpiresAt: 1 },
        $inc: { version: 1 },
      }, { session });
      hold.status = status;
      await hold.save({ session });
      return hold.eventId.toString();
    });
    if (eventId) notifySeatChanges(eventId);
    return Boolean(eventId);
  } finally {
    await session.endSession();
  }
}

export async function releaseSeatHold(input: { holdId: string; customerId: string }): Promise<void> {
  await finishHold(input.holdId, "released", input.customerId);
}

export async function expireDueSeatHolds(now = new Date()): Promise<number> {
  const holds = await SeatHold.find({ status: "active", expiresAt: { $lte: now } }).select("_id").lean();
  let expired = 0;
  for (const hold of holds) if (await finishHold(hold._id.toString(), "expired", undefined, now)) expired++;
  return expired;
}
