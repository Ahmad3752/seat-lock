import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { createHold, releaseHold } from "./holds.controller.js";

const router = Router();
router.post("/:eventId/holds", requireAuth, requireRole("customer"), createHold);
export const releaseRouter = Router();
releaseRouter.delete("/:holdId", requireAuth, requireRole("customer"), releaseHold);
export default router;
