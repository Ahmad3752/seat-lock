import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";

export function holdInput(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AppError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  }
  const { seatIds, idempotencyKey } = body as Record<string, unknown>;
  if (!Array.isArray(seatIds) || seatIds.length < 1 || seatIds.length > env.maxSeatsPerHold ||
    seatIds.some((id) => typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id) || !Types.ObjectId.isValid(id))) {
    throw new AppError(400, "INVALID_REQUEST", `Select between 1 and ${env.maxSeatsPerHold} valid seats.`);
  }
  const normalizedIds = (seatIds as string[]).map((id) => id.toLowerCase());
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new AppError(400, "INVALID_REQUEST", "Seat ids must be distinct.");
  }
  if (typeof idempotencyKey !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(idempotencyKey)) {
    throw new AppError(400, "INVALID_REQUEST", "An idempotency key must be a UUID.");
  }
  return { seatIds: normalizedIds, idempotencyKey: idempotencyKey.toLowerCase() };
}
