import { User } from "../models/user.model.js";
import { AppError } from "../errors/app-error.js";
import { asyncHandler } from "../utils/async-handler.js";

// Privileged actions must use the current database role, not a stale JWT claim.
export const requireCurrentRole = asyncHandler(async (req, _res, next) => {
  const user = await User.findById(req.user!.sub).select("role").lean();
  if (!user || user.role !== req.user!.role) throw new AppError(403, "ROLE_CHANGED", "Your access has changed. Sign in again.");
  next();
});
