import { AppError } from "../errors/app-error.js";
import type { AccessTokenPayload } from "../utils/tokens.js";

/**
 * Use after loading an organizer-owned venue or event. Admins are allowed to
 * moderate every resource; organizers may only act on resources they own.
 */
export function assertOrganizerOwnership(
  organizerId: { toString(): string } | string,
  user: AccessTokenPayload,
) {
  if (user.role === "admin") return;
  if (user.role !== "organizer" || organizerId.toString() !== user.sub) {
    throw new AppError(403, "RESOURCE_NOT_OWNED", "You can only manage venues and events you created.");
  }
}
