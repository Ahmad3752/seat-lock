import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(process.env.PORT ?? 5000),
  mongoUri: required("MONGODB_URI"),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  holdDurationMinutes: Number(process.env.HOLD_DURATION_MINUTES ?? 10),
  maxSeatsPerHold: Number(process.env.MAX_SEATS_PER_HOLD ?? 8),
  holdExpiryWorkerIntervalMs: Number(process.env.HOLD_EXPIRY_WORKER_INTERVAL_MS ?? 30_000),
};

if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) throw new Error("PORT must be a valid port number.");
if (!Number.isInteger(env.refreshTokenDays) || env.refreshTokenDays < 1) throw new Error("REFRESH_TOKEN_DAYS must be a positive whole number.");
if (!Number.isInteger(env.holdDurationMinutes) || env.holdDurationMinutes < 1) throw new Error("HOLD_DURATION_MINUTES must be a positive whole number.");
if (!Number.isInteger(env.maxSeatsPerHold) || env.maxSeatsPerHold < 1) throw new Error("MAX_SEATS_PER_HOLD must be a positive whole number.");
if (!Number.isInteger(env.holdExpiryWorkerIntervalMs) || env.holdExpiryWorkerIntervalMs < 1) throw new Error("HOLD_EXPIRY_WORKER_INTERVAL_MS must be a positive whole number.");
