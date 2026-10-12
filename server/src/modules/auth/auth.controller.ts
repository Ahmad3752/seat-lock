import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { Types } from "mongoose";
import { env } from "../../config/env.js";
import { demoUsernameToEmail } from "../../config/demo-users.js";
import { AppError } from "../../errors/app-error.js";
import { RefreshSession } from "../../models/refresh-session.model.js";
import { User } from "../../models/user.model.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { createAccessToken, createRefreshSecret, hashToken, refreshCookieOptions } from "../../utils/tokens.js";

const REFRESH_COOKIE = "seatlock_refresh";
type Role = "customer" | "organizer" | "admin";

function userDto(user: { _id: Types.ObjectId; name: string; email: string; role: string }) {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role as Role };
}

function credentials(body: unknown, needsName = false, allowDemoUsername = false) {
  if (typeof body !== "object" || body === null) throw new AppError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  const input = body as Record<string, unknown>;
  const identifier = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const email = allowDemoUsername ? (demoUsernameToEmail(identifier) ?? identifier) : identifier;
  const password = typeof input.password === "string" ? input.password : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const problems: string[] = [];
  if (needsName && (name.length < 2 || name.length > 80)) problems.push("Name must be between 2 and 80 characters.");
  if (!/^\S+@\S+\.\S+$/.test(email)) problems.push("Enter a valid email address.");
  if (password.length < 8 || password.length > 128) problems.push("Password must be between 8 and 128 characters.");
  if (problems.length) throw new AppError(422, "VALIDATION_ERROR", "Please correct the highlighted fields.", problems);
  return { name, email, password };
}

function parseRefreshCookie(req: Request) {
  const value = req.cookies[REFRESH_COOKIE];
  if (typeof value !== "string") return null;
  const separator = value.indexOf(".");
  if (separator < 1) return null;
  const sessionId = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  if (!Types.ObjectId.isValid(sessionId) || !secret) return null;
  return { sessionId, secret };
}

async function issueSession(res: Response, user: { _id: Types.ObjectId; role: string }, userAgent?: string) {
  const secret = createRefreshSecret();
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
  const session = await RefreshSession.create({
    userId: user._id,
    tokenHash: hashToken(secret),
    expiresAt,
    userAgent: userAgent?.slice(0, 500) ?? null,
  });
  res.cookie(REFRESH_COOKIE, `${session._id.toString()}.${secret}`, refreshCookieOptions());
  return createAccessToken({ sub: user._id.toString(), role: user.role as Role });
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = credentials(req.body, true);
  const existingUser = await User.exists({ email });
  if (existingUser) throw new AppError(409, "EMAIL_IN_USE", "An account with that email already exists.");

  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  const accessToken = await issueSession(res, user, req.get("user-agent"));
  res.status(201).json({ data: { user: userDto(user), accessToken } });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = credentials(req.body, false, true);
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  const accessToken = await issueSession(res, user, req.get("user-agent"));
  res.status(200).json({ data: { user: userDto(user), accessToken } });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = parseRefreshCookie(req);
  if (!token) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Your session has expired. Please sign in again.");
  const session = await RefreshSession.findById(token.sessionId).select("+tokenHash");
  const valid = session && !session.revokedAt && session.expiresAt > new Date() && session.tokenHash === hashToken(token.secret);
  if (!valid) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Your session has expired. Please sign in again.");
  }
  const user = await User.findById(session.userId);
  if (!user) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Your session has expired. Please sign in again.");

  session.revokedAt = new Date();
  await session.save();
  const accessToken = await issueSession(res, user, req.get("user-agent"));
  res.status(200).json({ data: { user: userDto(user), accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  const token = parseRefreshCookie(req);
  if (token) {
    const session = await RefreshSession.findById(token.sessionId).select("+tokenHash");
    if (session && session.userId.toString() === req.user!.sub && session.tokenHash === hashToken(token.secret)) {
      session.revokedAt = new Date();
      await session.save();
    }
  }
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  res.status(204).send();
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.sub);
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  res.status(200).json({ data: { user: userDto(user) } });
});
