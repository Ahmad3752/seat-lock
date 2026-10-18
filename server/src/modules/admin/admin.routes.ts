import { Router } from "express";
import mongoose, { Types } from "mongoose";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireCurrentRole } from "../../middleware/current-role.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { AppError } from "../../errors/app-error.js";
import { User } from "../../models/user.model.js";
import { Event } from "../../models/event.model.js";
import { Booking } from "../../models/booking.model.js";
import { RoleAudit } from "../../models/role-audit.model.js";
import { notifySeatChanges } from "../../realtime/seat-updates.js";

const router = Router();
router.use(requireAuth, requireRole("admin"), requireCurrentRole);
router.get("/overview", asyncHandler(async (_req, res) => {
  const [users, events, bookings] = await Promise.all([
    User.find().select("name email role createdAt").sort({ createdAt: -1 }).lean(),
    Event.find().select("title status organizerId startsAt").sort({ startsAt: -1 }).lean(),
    Booking.find().sort({ createdAt: -1 }).lean(),
  ]);
  res.json({ data: { users, events, bookings, summary: { users: users.length, organizers: users.filter((user) => user.role === "organizer").length, events: events.length, bookings: bookings.length, simulatedTotal: bookings.reduce((sum, booking) => sum + booking.total, 0) } } });
}));
router.patch("/users/:userId/role", asyncHandler(async (req, res) => {
  if (typeof req.params.userId !== "string" || !Types.ObjectId.isValid(req.params.userId)) throw new AppError(404, "NOT_FOUND", "User was not found.");
  if (req.body?.role !== "customer" && req.body?.role !== "organizer") throw new AppError(400, "INVALID_ROLE", "Choose customer or organizer.");
  const session = await mongoose.startSession();
  try {
    const user = await session.withTransaction(async () => {
      const target = await User.findById(req.params.userId).session(session);
      if (!target) throw new AppError(404, "NOT_FOUND", "User was not found.");
      if (target.role === "admin") throw new AppError(403, "FORBIDDEN", "Admin accounts cannot be changed here.");
      const oldRole = target.role;
      if (oldRole !== req.body.role) {
        target.role = req.body.role;
        await target.save({ session });
        await RoleAudit.create([{ actorId: req.user!.sub, targetId: target._id, oldRole, newRole: target.role }], { session });
      }
      return { id: target.id, name: target.name, email: target.email, role: target.role };
    });
    res.json({ data: { user } });
  } finally { await session.endSession(); }
}));
router.post("/events/:eventId/cancel", asyncHandler(async (req, res) => {
  if (typeof req.params.eventId !== "string" || !Types.ObjectId.isValid(req.params.eventId)) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  const event = await Event.findByIdAndUpdate(req.params.eventId, { $set: { status: "cancelled" } }, { returnDocument: "after" }).lean();
  if (!event) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  notifySeatChanges(event._id.toString());
  res.json({ data: { event: { id: event._id.toString(), status: event.status } } });
}));
export default router;
