import bcrypt from "bcryptjs";
import { env } from "./env.js";
import { User } from "../models/user.model.js";

const DEMO_PASSWORD = "12345678";

const demoUsers = [
  { username: "organizer", email: "organizer@seatlock.demo", name: "Organizer", role: "organizer" as const },
  { username: "admin", email: "admin@seatlock.demo", name: "Admin", role: "admin" as const },
];

/** Maps the development-only username fields on the sign-in screen to emails. */
export function demoUsernameToEmail(identifier: string) {
  if (env.isProduction) return null;
  return demoUsers.find((user) => user.username === identifier.trim().toLowerCase())?.email ?? null;
}

/** Creates predictable demo accounts for local role testing. Never runs in production. */
export async function seedDevelopmentDemoUsers() {
  if (env.isProduction) return;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  await Promise.all(demoUsers.map((user) => User.updateOne(
    { email: user.email },
    { $setOnInsert: { name: user.name, role: user.role, passwordHash } },
    { upsert: true, runValidators: true },
  )));
  console.log("Development demo accounts are ready: organizer / admin (password: 12345678).");
}
