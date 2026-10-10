import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { adminDashboard, customerDashboard, organizerDashboard } from "./dashboard.controller.js";

const router = Router();

router.get("/customer", requireAuth, requireRole("customer", "organizer"), customerDashboard);
router.get("/organizer", requireAuth, requireRole("organizer", "admin"), organizerDashboard);
router.get("/admin", requireAuth, requireRole("admin"), adminDashboard);

export default router;
