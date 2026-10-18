import { randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import { Booking } from "../../models/booking.model.js";
import { Event } from "../../models/event.model.js";
import { EventSeat } from "../../models/event-seat.model.js";
import { SeatHold } from "../../models/seat-hold.model.js";
import { notifySeatChanges } from "../../realtime/seat-updates.js";

export async function checkoutDemo(customerId: string, holdId: unknown, amount: unknown) {
  if (env.isProduction) throw new AppError(403, "DEMO_DISABLED", "Demo checkout is unavailable in production.");
  if (typeof holdId !== "string" || !/^[a-f\d]{24}$/i.test(holdId)) throw new AppError(404, "NOT_FOUND", "Hold was not found.");
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) throw new AppError(400, "INVALID_AMOUNT", "Enter a whole rupee amount.");
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const hold = await SeatHold.findOne({ _id: holdId, customerId }).session(session);
      if (!hold) throw new AppError(404, "NOT_FOUND", "Hold was not found.");
      if (hold.total !== amount) throw new AppError(400, "AMOUNT_MISMATCH", "Enter the exact total shown on your hold.");
      const existing = await Booking.findOne({ holdId: hold._id, customerId }).session(session).lean();
      if (existing) return { booking: existing, changed: false };
      const now = new Date();
      if (hold.status !== "active" || hold.expiresAt <= now) throw new AppError(409, "HOLD_EXPIRED", "Your hold is no longer active. Select seats again.");
      // Write the event in the transaction so cancellation conflicts with checkout.
      const event = await Event.findOneAndUpdate({ _id: hold.eventId, status: "published", startsAt: { $gt: now } }, { $inc: { __v: 1 } }, { session, returnDocument: "after" }).lean();
      if (!event) throw new AppError(409, "EVENT_UNAVAILABLE", "This event is no longer available.");
      const seats = await EventSeat.updateMany({ _id: { $in: hold.seatIds }, eventId: hold.eventId, status: "held", holdId: hold._id, holdExpiresAt: { $gt: now } }, {
        $set: { status: "booked" }, $unset: { holdId: 1, holdTokenHash: 1, holdExpiresAt: 1 }, $inc: { version: 1 },
      }, { session });
      if (seats.modifiedCount !== hold.seatIds.length) throw new AppError(409, "HOLD_EXPIRED", "Your seats are no longer held. Select seats again.");
      hold.status = "converted";
      await hold.save({ session });
      const [booking] = await Booking.create([{ holdId: hold._id, customerId: new Types.ObjectId(customerId), eventId: event._id, eventTitle: event.title, startsAt: event.startsAt, reference: `SL-${randomUUID().toUpperCase()}`, seats: hold.snapshots, total: hold.total, currency: hold.currency, paymentStatus: "simulated" }], { session });
      return { booking: booking!.toObject(), changed: true };
    });
    if (result.changed) notifySeatChanges(result.booking.eventId.toString());
    return result.booking;
  } finally { await session.endSession(); }
}
