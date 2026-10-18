import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { requireCurrentRole } from "../../middleware/current-role.js";
import { eventReport } from "./report.controller.js";
import { createEvent, createVenue, getEvent, getVenue, listEvents, listVenues, publishEvent, updateEvent, updateVenue } from "./organizer.controller.js";

const router = Router();

router.use(requireAuth, requireRole("organizer", "admin"), requireCurrentRole);

router.post("/venues", createVenue);
router.get("/venues", listVenues);
router.get("/venues/:venueId", getVenue);
router.patch("/venues/:venueId", updateVenue);

router.post("/events", createEvent);
router.get("/events", listEvents);
router.get("/events/:eventId/report", eventReport);
router.get("/events/:eventId", getEvent);
router.patch("/events/:eventId", updateEvent);
router.post("/events/:eventId/publish", publishEvent);

export default router;
