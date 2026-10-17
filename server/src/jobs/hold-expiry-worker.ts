import { env } from "../config/env.js";
import { expireDueSeatHolds } from "../modules/holds/holds.service.js";

export function startHoldExpiryWorker(): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void expireDueSeatHolds().catch((error: unknown) => console.error("Unable to expire seat holds", error)).finally(() => { running = false; });
  }, env.holdExpiryWorkerIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
