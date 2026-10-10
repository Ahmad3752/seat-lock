import type { RequestHandler } from "express";

function respond(res: Parameters<RequestHandler>[1], title: string, description: string) {
  res.status(200).json({ data: { title, description } });
}

export const customerDashboard: RequestHandler = (_req, res) => {
  respond(res, "My bookings", "Your confirmed bookings and active seat holds will appear here.");
};

export const organizerDashboard: RequestHandler = (_req, res) => {
  respond(res, "My events", "Create venues and manage the events you organize.");
};

export const adminDashboard: RequestHandler = (_req, res) => {
  respond(res, "Platform moderation", "Manage users and events across the SeatLock platform.");
};
