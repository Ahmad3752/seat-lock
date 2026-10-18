import assert from "node:assert/strict";
import test, { before } from "node:test";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { io as connect } from "socket.io-client";
import request from "supertest";
import { installTestDatabase } from "./helpers/database.js";

process.env.MONGODB_URI = "mongodb://unused-for-http-tests";
process.env.JWT_ACCESS_SECRET = "test-access-secret";

const [{ createApp }, { Event }, { EventSeat }, { SeatHold }, { createAccessToken }] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/event.model.js"),
  import("../src/models/event-seat.model.js"),
  import("../src/models/seat-hold.model.js"),
  import("../src/utils/tokens.js"),
]);
const app = createApp();
const { Booking } = await import("../src/models/booking.model.js");
const customerId = new mongoose.Types.ObjectId().toString();
const bearer = (id = customerId, role: "customer" | "organizer" | "admin" = "customer") =>
  `Bearer ${createAccessToken({ sub: id, role })}`;

installTestDatabase();

before(async () => {
  await mongoose.connection.collection("transaction_smoke").createIndex({ marker: 1 }, { unique: true });
  await Promise.all([Event.init(), EventSeat.init(), SeatHold.init(), Booking.init()]);
});

async function fixture(eventOverrides: Record<string, unknown> = {}) {
  const venueId = new mongoose.Types.ObjectId();
  const event = await Event.create({
    organizerId: new mongoose.Types.ObjectId(), venueId, title: "Hold test concert", category: "Music",
    startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000),
    timezone: "Asia/Karachi", status: "published", currency: "PKR",
    sectionPrices: [{ section: "A", amount: 2500 }], ...eventOverrides,
  });
  const seats = await EventSeat.create([2500, 1801].map((price, index) => ({
    eventId: event._id, venueId, seatKey: `A:A:${index + 1}`, section: "A", row: "A", number: index + 1,
    label: `A-0${index + 1}`, gridRow: 1, gridColumn: index + 1, price, status: "available",
  })));
  return { event, seats, seatIds: seats.map((seat) => seat._id.toString()), url: `/api/v1/events/${event._id}/holds` };
}

test("demo checkout books held seats atomically and returns the same booking on retry", async () => {
  const { url, seatIds } = await fixture();
  const held = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  const holdId = held.body.data.hold.id;
  const checkout = () => request(app).post(`/api/v1/bookings/checkout`).set("Authorization", bearer()).send({ holdId, amount: 4301 });
  const [first, second] = await Promise.all([checkout(), checkout()]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.data.booking.reference, second.body.data.booking.reference);
  assert.equal(first.body.data.booking.paymentStatus, "simulated");
  assert.equal(await EventSeat.countDocuments({ _id: { $in: seatIds }, status: "booked" }), 2);
  assert.equal((await SeatHold.findById(holdId).lean())?.status, "converted");
  const history = await request(app).get("/api/v1/bookings").set("Authorization", bearer()).expect(200);
  assert.equal(history.body.data.bookings.length, 1);
  const other = await request(app).get("/api/v1/bookings").set("Authorization", bearer(new mongoose.Types.ObjectId().toString())).expect(200);
  assert.equal(other.body.data.bookings.length, 0);
});

test("demo checkout rejects wrong amounts, foreign holds and expired holds", async () => {
  const { url, seatIds } = await fixture();
  const held = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  const holdId = held.body.data.hold.id;
  await request(app).post("/api/v1/bookings/checkout").set("Authorization", bearer()).send({ holdId, amount: 1 }).expect(400);
  await request(app).post("/api/v1/bookings/checkout").set("Authorization", bearer(new mongoose.Types.ObjectId().toString())).send({ holdId, amount: 4301 }).expect(404);
  await SeatHold.updateOne({ _id: holdId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await request(app).post("/api/v1/bookings/checkout").set("Authorization", bearer()).send({ holdId, amount: 4301 }).expect(409);
  assert.equal(await EventSeat.countDocuments({ status: "booked" }), 0);
});

test("simultaneous release and checkout cannot leave a booking for available seats", async () => {
  const { url, seatIds } = await fixture();
  const held = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  const holdId = held.body.data.hold.id;
  await Promise.all([
    request(app).post("/api/v1/bookings/checkout").set("Authorization", bearer()).send({ holdId, amount: 4301 }),
    request(app).delete(`/api/v1/holds/${holdId}`).set("Authorization", bearer()),
  ]);
  const booking = await Booking.findOne({ holdId }).lean();
  const seats = await EventSeat.find({ _id: { $in: seatIds } }).lean();
  assert.ok(seats.every((seat) => seat.status === (booking ? "booked" : "available")));
});

test("demo checkout is disabled in production", async () => {
  const { env } = await import("../src/config/env.js");
  const previous = env.isProduction;
  env.isProduction = true;
  try {
    await request(app).post("/api/v1/bookings/checkout").set("Authorization", bearer()).send({ holdId: new mongoose.Types.ObjectId().toString(), amount: 1 }).expect(403);
  } finally { env.isProduction = previous; }
});

test("only committed hold, release and expiry changes notify event viewers", async () => {
  const { createRealtimeServer } = await import("../src/realtime/seat-updates.js");
  const { expireDueSeatHolds } = await import("../src/modules/holds/holds.service.js");
  const server = createServer();
  const realtime = createRealtimeServer(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const socket = connect(`http://127.0.0.1:${address.port}`, { transports: ["websocket"] });
  try {
    const { event, url, seatIds } = await fixture();
    await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
    assert.equal(await socket.timeout(2000).emitWithAck("join-event", event._id.toString()), true);
    let changes = 0;
    socket.on("seats-changed", () => { changes++; });
    const body = { seatIds: [seatIds[0]], idempotencyKey: randomUUID() };
    const created = await request(app).post(url).set("Authorization", bearer()).send(body).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(changes, 1);
    await request(app).post(url).set("Authorization", bearer()).send(body).expect(201);
    await request(app).post(url).set("Authorization", bearer()).send({ ...body, idempotencyKey: randomUUID() }).expect(409);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(changes, 1);
    await request(app).delete(`/api/v1/holds/${created.body.data.hold.id}`).set("Authorization", bearer()).expect(204);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(changes, 2);
    const second = await request(app).post(url).set("Authorization", bearer()).send({ ...body, idempotencyKey: randomUUID() }).expect(201);
    await SeatHold.updateOne({ _id: second.body.data.hold.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expireDueSeatHolds();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(changes, 4);
    const third = await request(app).post(url).set("Authorization", bearer()).send({ ...body, idempotencyKey: randomUUID() }).expect(201);
    await request(app).post("/api/v1/bookings/checkout").set("Authorization", bearer()).send({ holdId: third.body.data.hold.id, amount: 2500 }).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(changes, 6);
  } finally {
    socket.disconnect();
    await new Promise<void>((resolve) => realtime.close(() => resolve()));
  }
});

test("customer hold commits two seats, whole-PKR snapshots, and only public fields", async () => {
  const { url, seatIds } = await fixture();
  const before = Date.now();
  const response = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  const hold = response.body.data.hold;
  assert.deepEqual(Object.keys(hold).sort(), ["currency", "expiresAt", "id", "seats", "status", "total"]);
  assert.deepEqual(hold.seats, [{ id: seatIds[0], label: "A-01", price: 2500 }, { id: seatIds[1], label: "A-02", price: 1801 }]);
  assert.equal(hold.total, 4301);
  assert.equal(hold.currency, "PKR");
  assert.equal(hold.status, "active");
  assert.ok(new Date(hold.expiresAt).getTime() >= before + 600_000);
  assert.ok(new Date(hold.expiresAt).getTime() <= Date.now() + 600_000);
  const stored = await SeatHold.findById(hold.id).lean();
  assert.equal(stored?.customerId.toString(), customerId);
  assert.match(stored!.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal("token" in stored!, false);
  for (const seat of await EventSeat.find({ _id: { $in: seatIds } }).lean()) {
    assert.equal(seat.status, "held");
    assert.equal(seat.holdId?.toString(), hold.id);
    assert.equal(seat.holdTokenHash, stored!.tokenHash);
    assert.equal(seat.holdExpiresAt?.toISOString(), hold.expiresAt);
    assert.equal(seat.version, 1);
  }
});

for (const [name, makeBody] of [
  ["malformed seat id", () => ({ seatIds: ["bad"], idempotencyKey: randomUUID() })],
  ["duplicate seat ids", (ids: string[]) => ({ seatIds: [ids[0], ids[0]], idempotencyKey: randomUUID() })],
  ["case variant duplicate ids", () => ({ seatIds: ["abcdefabcdefabcdefabcdef", "ABCDEFABCDEFABCDEFABCDEF"], idempotencyKey: randomUUID() })],
  ["non-UUID key", (ids: string[]) => ({ seatIds: ids, idempotencyKey: "not-a-uuid" })],
  ["zero seats", () => ({ seatIds: [], idempotencyKey: randomUUID() })],
  ["nine seats", () => ({ seatIds: Array.from({ length: 9 }, () => new mongoose.Types.ObjectId().toString()), idempotencyKey: randomUUID() })],
  ["non-object body", () => []],
] as const) {
  test(`hold request rejects ${name}`, async () => {
    const { url, seatIds } = await fixture();
    const response = await request(app).post(url).set("Authorization", bearer()).send(makeBody(seatIds)).expect(400);
    assert.equal(response.body.error.code, "INVALID_REQUEST");
    assert.equal(await SeatHold.countDocuments(), 0);
    assert.equal(await EventSeat.countDocuments({ status: "held" }), 0);
  });
}

test("hold creation requires a customer", async () => {
  const { url, seatIds } = await fixture();
  const body = { seatIds, idempotencyKey: randomUUID() };
  await request(app).post(url).send(body).expect(401);
  for (const role of ["organizer", "admin"] as const) {
    await request(app).post(url).set("Authorization", bearer(customerId, role)).send(body).expect(403);
  }
});

for (const [name, overrides] of [
  ["unpublished", { status: "draft" }], ["cancelled", { status: "cancelled" }],
  ["started", { startsAt: new Date(Date.now() - 1000) }],
  ["sale not started", { saleStartsAt: new Date(Date.now() + 86_400_000) }],
  ["sale ended", { saleEndsAt: new Date(Date.now() - 1000) }],
] as const) {
  test(`hold creation hides ${name} events`, async () => {
    const { url, seatIds } = await fixture(overrides);
    const response = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(404);
    assert.equal(response.body.error.code, "NOT_FOUND");
    assert.equal(await SeatHold.countDocuments(), 0);
  });
}

test("hold creation hides unknown and malformed events", async () => {
  for (const eventId of [new mongoose.Types.ObjectId().toString(), "bad-id"]) {
    const response = await request(app).post(`/api/v1/events/${eventId}/holds`).set("Authorization", bearer())
      .send({ seatIds: [new mongoose.Types.ObjectId().toString()], idempotencyKey: randomUUID() }).expect(404);
    assert.equal(response.body.error.code, "NOT_FOUND");
  }
});

for (const state of ["booked", "blocked", "held"] as const) {
  test(`hold rejects ${state} seats without changing any requested inventory`, async () => {
    const { url, seatIds } = await fixture();
    await EventSeat.updateOne({ _id: seatIds[1] }, { $set: { status: state, holdExpiresAt: new Date(Date.now() + 60_000) } });
    const original = await EventSeat.find().sort({ _id: 1 }).lean();
    const response = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(409);
    assert.equal(response.body.error.code, "SEAT_UNAVAILABLE");
    assert.deepEqual(await EventSeat.find().sort({ _id: 1 }).lean(), original);
    assert.equal(await SeatHold.countDocuments(), 0);
  });
}

test("missing and foreign-event seats abort all changes", async () => {
  const first = await fixture();
  const other = await fixture();
  for (const id of [new mongoose.Types.ObjectId().toString(), other.seatIds[0]!]) {
    const response = await request(app).post(first.url).set("Authorization", bearer())
      .send({ seatIds: [first.seatIds[0], id], idempotencyKey: randomUUID() }).expect(409);
    assert.equal(response.body.error.code, "SEAT_UNAVAILABLE");
  }
  assert.equal(await EventSeat.countDocuments({ status: "available", version: 0 }), 4);
  assert.equal(await SeatHold.countDocuments(), 0);
});

test("expired held seats are reclaimed but booked and blocked expiry metadata is ignored", async () => {
  const { url, seatIds } = await fixture();
  const oldHoldId = new mongoose.Types.ObjectId();
  await EventSeat.updateMany({}, { $set: { status: "held", holdId: oldHoldId, holdTokenHash: "old", holdExpiresAt: new Date(Date.now() - 1000) } });
  const response = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  assert.equal(await EventSeat.countDocuments({ holdId: response.body.data.hold.id, version: 1 }), 2);
  for (const status of ["booked", "blocked"] as const) {
    await EventSeat.updateOne({ _id: seatIds[0] }, { $set: { status, holdExpiresAt: new Date(Date.now() - 1000) } });
    const denied = await request(app).post(url).set("Authorization", bearer()).send({ seatIds: [seatIds[0]], idempotencyKey: randomUUID() }).expect(409);
    assert.equal(denied.body.error.code, "SEAT_UNAVAILABLE");
    assert.equal((await EventSeat.findById(seatIds[0]))?.status, status);
  }
});

test("same-key retry returns the original snapshot with reordered selection", async () => {
  const { url, seatIds } = await fixture();
  const idempotencyKey = randomUUID();
  const first = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey }).expect(201);
  await EventSeat.updateMany({}, { $set: { price: 9999 } });
  const retry = await request(app).post(url).set("Authorization", bearer()).send({ seatIds: [...seatIds].reverse(), idempotencyKey }).expect(201);
  assert.deepEqual(retry.body, first.body);
  assert.equal(await SeatHold.countDocuments(), 1);
  assert.equal(await EventSeat.countDocuments({ version: 1 }), 2);
});

test("same-key retry returns its existing hold after ticket sales close", async () => {
  const { event, url, seatIds } = await fixture();
  const body = { seatIds, idempotencyKey: randomUUID() };
  const first = await request(app).post(url).set("Authorization", bearer()).send(body).expect(201);
  await Event.updateOne({ _id: event._id }, { $set: { saleEndsAt: new Date(Date.now() - 1000) } });
  const retry = await request(app).post(url).set("Authorization", bearer()).send(body).expect(201);
  assert.deepEqual(retry.body, first.body);
});

test("same-key changed selection or event returns an idempotency conflict", async () => {
  const { url, seatIds } = await fixture();
  const idempotencyKey = randomUUID();
  await request(app).post(url).set("Authorization", bearer()).send({ seatIds: [seatIds[0]], idempotencyKey }).expect(201);
  const other = await fixture();
  for (const [target, ids] of [[url, [seatIds[1]]], [other.url, other.seatIds]] as const) {
    const response = await request(app).post(target).set("Authorization", bearer()).send({ seatIds: ids, idempotencyKey }).expect(409);
    assert.equal(response.body.error.code, "IDEMPOTENCY_CONFLICT");
  }
  assert.equal(await SeatHold.countDocuments(), 1);
});

test("twenty simultaneous customers produce exactly one hold and nineteen safe conflicts", async () => {
  const { url, seatIds } = await fixture();
  const responses = await Promise.all(Array.from({ length: 20 }, () => request(app).post(url)
    .set("Authorization", bearer(new mongoose.Types.ObjectId().toString())).send({ seatIds: [seatIds[0]], idempotencyKey: randomUUID() })));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 409 && response.body.error.code === "SEAT_UNAVAILABLE").length, 19);
  assert.equal(await SeatHold.countDocuments({ status: "active" }), 1);
  assert.equal(await EventSeat.countDocuments({ status: "held", version: 1 }), 1);
});

test("simultaneous same-key retries return one identical hold", async () => {
  const { url, seatIds } = await fixture();
  const body = { seatIds, idempotencyKey: randomUUID() };
  const responses = await Promise.all(Array.from({ length: 10 }, () => request(app).post(url).set("Authorization", bearer()).send(body)));
  for (const response of responses) {
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, responses[0]!.body);
  }
  assert.equal(await SeatHold.countDocuments(), 1);
  assert.equal(await EventSeat.countDocuments({ status: "held", version: 1 }), 2);
});

test("simultaneous same-key different selections roll back the losing claim", async () => {
  const { url, seatIds } = await fixture();
  const idempotencyKey = randomUUID();
  const responses = await Promise.all(seatIds.map((seatId) => request(app).post(url).set("Authorization", bearer())
    .send({ seatIds: [seatId], idempotencyKey })));
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.equal(responses.filter((response) => response.status === 409 && response.body.error.code === "IDEMPOTENCY_CONFLICT").length, 1);
  assert.equal(await SeatHold.countDocuments(), 1);
  assert.equal(await EventSeat.countDocuments({ status: "held", version: 1 }), 1);
  assert.equal(await EventSeat.countDocuments({ status: "available", version: 0 }), 1);
});

test("only the owner can release a hold, and repeating release is safe", async () => {
  const { url, seatIds } = await fixture();
  const created = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  const id = created.body.data.hold.id;
  await request(app).delete(`/api/v1/holds/${id}`).set("Authorization", bearer(new mongoose.Types.ObjectId().toString())).expect(404);
  assert.equal(await EventSeat.countDocuments({ status: "held" }), 2);
  await request(app).delete(`/api/v1/holds/${id}`).set("Authorization", bearer()).expect(204);
  await request(app).delete(`/api/v1/holds/${id}`).set("Authorization", bearer()).expect(204);
  assert.equal(await EventSeat.countDocuments({ status: "available", version: 2 }), 2);
  assert.equal((await SeatHold.findById(id))?.status, "released");
});

test("expiry frees only seats still held by the expired hold, never booked seats or a newer hold", async () => {
  const { url, seatIds } = await fixture();
  const created = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  const id = created.body.data.hold.id;
  await SeatHold.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await EventSeat.updateOne({ _id: seatIds[0] }, { $set: { status: "booked" } });
  const replacement = new mongoose.Types.ObjectId();
  await EventSeat.updateOne({ _id: seatIds[1] }, { $set: { holdId: replacement } });
  const { expireDueSeatHolds } = await import("../src/modules/holds/holds.service.js");
  assert.equal(await expireDueSeatHolds(), 1);
  assert.equal((await EventSeat.findById(seatIds[0]))?.status, "booked");
  assert.equal((await EventSeat.findById(seatIds[1]))?.holdId?.toString(), replacement.toString());
  assert.equal((await SeatHold.findById(id))?.status, "expired");
});

test("expiry frees matching held seats", async () => {
  const { url, seatIds } = await fixture();
  const created = await request(app).post(url).set("Authorization", bearer()).send({ seatIds, idempotencyKey: randomUUID() }).expect(201);
  await SeatHold.updateOne({ _id: created.body.data.hold.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const { expireDueSeatHolds } = await import("../src/modules/holds/holds.service.js");
  await expireDueSeatHolds();
  assert.equal(await EventSeat.countDocuments({ status: "available", version: 2 }), 2);
});

test("test database commits a document inside a transaction", async () => {
  const collection = mongoose.connection.collection("transaction_smoke");
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await collection.insertOne({ marker: "committed" }, { session });
    });
  } finally {
    await session.endSession();
  }

  assert.equal(await collection.countDocuments({ marker: "committed" }), 1);
});

test("test cleanup preserves unique indexes between tests", async () => {
  const collection = mongoose.connection.collection("transaction_smoke");
  assert.equal(await collection.countDocuments({}), 0);
  await assert.rejects(
    collection.insertMany([{ marker: "duplicate" }, { marker: "duplicate" }]),
    (error: unknown) => error instanceof Error && "code" in error && error.code === 11000,
  );
});
