import assert from "node:assert/strict";
import test from "node:test";
import { formatHoldCountdown, remainingHoldSeconds, reconcileSelectedSeats } from "../../client/src/public-events/holdUtils.js";

test("hold countdown uses server expiry and never goes below zero", () => {
  assert.equal(remainingHoldSeconds("2026-01-01T00:10:00Z", Date.parse("2026-01-01T00:00:00Z")), 600);
  assert.equal(remainingHoldSeconds("2026-01-01T00:10:00Z", Date.parse("2026-01-01T00:11:00Z")), 0);
  assert.equal(formatHoldCountdown(61), "01:01");
});

test("refresh removes unavailable selections", () => {
  assert.deepEqual([...reconcileSelectedSeats(new Set(["a", "b"]), [{ id: "a", state: "available" }, { id: "b", state: "held" }])], ["a"]);
});
