import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { Booking } from "../../models/booking.model.js";
import { checkoutDemo } from "./bookings.service.js";

const router = Router();
router.post("/checkout", requireAuth, requireRole("customer", "organizer"), asyncHandler(async (req, res) => {
  const booking = await checkoutDemo(req.user!.sub, req.body?.holdId, req.body?.amount);
  res.status(200).json({ data: { booking } });
}));
router.get("/", requireAuth, requireRole("customer", "organizer"), asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ customerId: req.user!.sub }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ data: { bookings } });
}));
export default router;
