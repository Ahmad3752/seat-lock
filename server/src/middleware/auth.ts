import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import { verifyAccessToken, type AccessTokenPayload } from "../utils/tokens.js";

declare global { namespace Express { interface Request { user?: AccessTokenPayload; } } }

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Authentication is required."));
  try { req.user = verifyAccessToken(token); return next(); }
  catch { return next(new AppError(401, "INVALID_ACCESS_TOKEN", "Your session has expired. Please sign in again.")); }
};
export function requireRole(...roles: AccessTokenPayload["role"][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Authentication is required."));
    if (!roles.includes(req.user.role)) return next(new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."));
    return next();
  };
}
