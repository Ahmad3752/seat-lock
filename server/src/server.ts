
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { seedDevelopmentDemoUsers } from "./config/demo-users.js";
import { startHoldExpiryWorker } from "./jobs/hold-expiry-worker.js";

const app = createApp();

async function startServer() {
  await connectDatabase();
  await seedDevelopmentDemoUsers();
  const stopHoldExpiryWorker = startHoldExpiryWorker();

  const server = app.listen(env.port, () => {
    console.log(`SeatLock API running at http://localhost:${env.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received. Shutting down gracefully.`);
    stopHoldExpiryWorker();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error: unknown) => {
  console.error("Unable to start SeatLock API", error);
  process.exit(1);
});
