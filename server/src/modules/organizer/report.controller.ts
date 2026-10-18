import { Types } from "mongoose";
import { AppError } from "../../errors/app-error.js";
import { assertOrganizerOwnership } from "../../middleware/ownership.js";
import { Booking } from "../../models/booking.model.js";
import { Event } from "../../models/event.model.js";
import { EventSeat } from "../../models/event-seat.model.js";
import { User } from "../../models/user.model.js";
import { Venue } from "../../models/venue.model.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const eventReport = asyncHandler(async (req, res) => {
  const id = req.params.eventId;
  if (typeof id !== "string" || !Types.ObjectId.isValid(id)) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  const event = await Event.findById(id).lean();
  if (!event) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  assertOrganizerOwnership(event.organizerId, req.user!);
  const [venue, seats, bookings] = await Promise.all([
    Venue.findById(event.venueId).select("name address").lean(),
    EventSeat.find({ eventId: event._id }).select("status holdExpiresAt").lean(),
    Booking.find({ eventId: event._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const customers = await User.find({ _id: { $in: bookings.map((booking) => booking.customerId) } }).select("name email").lean();
  const byId = new Map(customers.map((customer) => [customer._id.toString(), customer]));
  const counts = { total: seats.length, available: 0, held: 0, booked: 0, blocked: 0 };
  const now = new Date();
  for (const seat of seats) {
    const state = seat.status === "held" && seat.holdExpiresAt && seat.holdExpiresAt <= now ? "available" : seat.status;
    if (state === "available" || state === "held" || state === "booked" || state === "blocked") counts[state]++;
  }
  const report = {
    event: { id: event._id.toString(), title: event.title, status: event.status, startsAt: event.startsAt, venue: venue ? { name: venue.name, address: venue.address } : null },
    seats: counts, bookingCount: bookings.length, ticketCount: bookings.reduce((sum, item) => sum + item.seats.length, 0),
    simulatedTotal: bookings.reduce((sum, item) => sum + item.total, 0),
    bookings: bookings.map((booking) => { const customer = byId.get(booking.customerId.toString()); return { reference: booking.reference, customer: customer ? { name: customer.name, email: customer.email } : { name: "Unavailable", email: "" }, seats: booking.seats.map((seat) => seat.label), status: "confirmed", paymentStatus: booking.paymentStatus, createdAt: booking.createdAt }; }),
  };
  res.status(200).json({ data: { report } });
});
