import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import { env } from "../config/env.js";

export interface AccessTokenPayload { sub: string; role: "customer" | "organizer" | "admin"; }

export function createAccessToken(payload: AccessTokenPayload) {
  const options: jwt.SignOptions = { expiresIn: env.jwtAccessExpiresIn as NonNullable<jwt.SignOptions["expiresIn"]> };
  return jwt.sign(payload, env.jwtAccessSecret, options);
}
export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwtAccessSecret);
  if (typeof payload === "string" || !payload.sub || !payload.role) throw new Error("Invalid access token.");
  return { sub: payload.sub, role: payload.role as AccessTokenPayload["role"] };
}
export const createRefreshSecret = () => crypto.randomBytes(48).toString("base64url");
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export function refreshCookieOptions(): CookieOptions {
  return { httpOnly: true, secure: env.isProduction, sameSite: env.isProduction ? "none" : "lax", path: "/api/v1/auth", maxAge: env.refreshTokenDays * 24 * 60 * 60 * 1000 };
}
