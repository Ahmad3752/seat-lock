import cors from "cors";
import express from "express";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import authRouter from "./modules/auth/auth.routes.js";
import dashboardRouter from "./modules/dashboard/dashboard.routes.js";
import organizerRouter from "./modules/organizer/organizer.routes.js";
import publicEventsRouter from "./modules/public-events/public-events.routes.js";
import holdsRouter, { releaseRouter } from "./modules/holds/holds.routes.js";
import bookingsRouter from "./modules/bookings/bookings.routes.js";
import adminRouter from "./modules/admin/admin.routes.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ success: true, message: "SeatLock API is running." });
  });
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/organizer", organizerRouter);
  app.use("/api/v1/events", publicEventsRouter);
  app.use("/api/v1/events", holdsRouter);
  app.use("/api/v1/holds", releaseRouter);
  app.use("/api/v1/bookings", bookingsRouter);
  app.use("/api/v1/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
