import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { io as connect, type Socket } from "socket.io-client";

process.env.MONGODB_URI = "mongodb://unused";
process.env.JWT_ACCESS_SECRET = "test-secret";

test("event rooms receive only their own inventory invalidations", async () => {
  const { createRealtimeServer } = await import("../src/realtime/seat-updates.js");
  const server = createServer();
  const realtime = createRealtimeServer(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const sockets: Socket[] = [];
  try {
    const open = async (eventId: string) => {
      const socket = connect(`http://127.0.0.1:${address.port}`, { transports: ["websocket"] });
      sockets.push(socket);
      await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
      const result = await socket.timeout(2000).emitWithAck("join-event", eventId);
      return { socket, result };
    };
    const firstId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const otherId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    const first = await open(firstId);
    const other = await open(otherId);
    const invalid = await open("not-an-id");
    assert.equal(first.result, true);
    assert.equal(other.result, true);
    assert.equal(invalid.result, false);
    let leaked = false;
    other.socket.on("seats-changed", () => { leaked = true; });
    invalid.socket.on("seats-changed", () => { leaked = true; });
    const received = new Promise<unknown>((resolve) => first.socket.once("seats-changed", resolve));
    realtime.notify(firstId);
    assert.deepEqual(await received, { eventId: firstId });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(leaked, false);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise<void>((resolve) => realtime.close(() => resolve()));
  }
});
