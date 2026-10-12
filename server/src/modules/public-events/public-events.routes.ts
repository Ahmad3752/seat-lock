import { Router } from "express";
import { getPublicEvent, getPublicEventSeats, listPublicEvents } from "./public-events.controller.js";

const publicEventsRouter = Router();

publicEventsRouter.get("/", listPublicEvents);
publicEventsRouter.get("/:eventId/seats", getPublicEventSeats);
publicEventsRouter.get("/:slug", getPublicEvent);

export default publicEventsRouter;
