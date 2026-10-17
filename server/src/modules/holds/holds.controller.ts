import type { RequestHandler } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { createSeatHold, releaseSeatHold } from "./holds.service.js";
import { holdInput } from "./holds.validation.js";

export const createHold: RequestHandler = asyncHandler(async (req, res) => {
  const input = holdInput(req.body);
  const hold = await createSeatHold({
    ...input,
    eventId: typeof req.params.eventId === "string" ? req.params.eventId : "",
    customerId: req.user!.sub,
  });
  res.status(201).json({ data: { hold } });
});

export const releaseHold: RequestHandler = asyncHandler(async (req, res) => {
  await releaseSeatHold({ holdId: typeof req.params.holdId === "string" ? req.params.holdId : "", customerId: req.user!.sub });
  res.status(204).end();
});
