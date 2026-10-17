
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { seedDevelopmentDemoUsers } from "./config/demo-users.js";
import { startHoldExpiryWorker } from "./jobs/hold-expiry-worker.js";
import { createServer } from "node:http";
import { createRealtimeServer } from "./realtime/seat-updates.js";

const app = createApp();

async function startServer() {
  await connectDatabase();
  await seedDevelopmentDemoUsers();
  const stopHoldExpiryWorker = startHoldExpiryWorker();

  const server = createServer(app);
  const realtime = createRealtimeServer(server);
  server.listen(env.port, () => {
    console.log(`SeatLock API running at http://localhost:${env.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received. Shutting down gracefully.`);
    stopHoldExpiryWorker();
    realtime.close(() => process.exit(0));
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error: unknown) => {
  console.error("Unable to start SeatLock API", error);
  process.exit(1);
});
