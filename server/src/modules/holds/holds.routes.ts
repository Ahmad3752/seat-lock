import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { createHold, releaseHold } from "./holds.controller.js";

const router = Router();
router.post("/:eventId/holds", requireAuth, requireRole("customer", "organizer"), createHold);
export const releaseRouter = Router();
releaseRouter.delete("/:holdId", requireAuth, requireRole("customer", "organizer"), releaseHold);
export default router;
