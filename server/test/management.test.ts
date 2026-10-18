import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import { installTestDatabase } from "./helpers/database.js";

process.env.MONGODB_URI = "mongodb://unused";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
const [{ createApp }, { User }, { Event }, { EventSeat }, { Venue }, { Booking }, { createAccessToken }] = await Promise.all([
  import("../src/app.js"), import("../src/models/user.model.js"), import("../src/models/event.model.js"), import("../src/models/event-seat.model.js"), import("../src/models/venue.model.js"), import("../src/models/booking.model.js"), import("../src/utils/tokens.js"),
]);
const app = createApp();
installTestDatabase();

async function user(role: "customer" | "organizer" | "admin", email: string) {
  const record = await User.create({ name: email, email: `${email}@example.com`, passwordHash: "unused", role });
  return { record, token: `Bearer ${createAccessToken({ sub: record.id, role })}` };
}

test("event report is owner-scoped and counts only confirmed bookings", async () => {
  const organizer = await user("organizer", "organizer");
  const stranger = await user("organizer", "other");
  const admin = await user("admin", "admin");
  const customer = await user("customer", "customer");
  const venue = await Venue.create({ organizerId: organizer.record._id, name: "Hall", address: "Karachi", seats: [{ seatKey: "A:A:1", section: "A", row: "A", number: 1, label: "A-01", gridRow: 1, gridColumn: 1 }] });
  const event = await Event.create({ organizerId: organizer.record._id, venueId: venue._id, title: "Concert", category: "Music", startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), timezone: "Asia/Karachi", status: "published", currency: "PKR", sectionPrices: [{ section: "A", amount: 1000 }] });
  const seats = await EventSeat.create(["booked", "held", "available"].map((status, i) => ({ eventId: event._id, venueId: venue._id, seatKey: `A:${i}`, section: "A", row: "A", number: i + 1, label: `A-0${i + 1}`, gridRow: 1, gridColumn: i + 1, price: 1000, status, ...(status === "held" ? { holdExpiresAt: new Date(Date.now() + 60000) } : {}) })));
  await Booking.create({ holdId: new mongoose.Types.ObjectId(), customerId: customer.record._id, eventId: event._id, eventTitle: event.title, startsAt: event.startsAt, reference: "SL-TEST", seats: [{ seatId: seats[0]!._id, label: "A-01", price: 1000 }], total: 1000, currency: "PKR", paymentStatus: "simulated" });
  const url = `/api/v1/organizer/events/${event.id}/report`;
  const result = await request(app).get(url).set("Authorization", organizer.token).expect(200);
  assert.deepEqual(result.body.data.report.seats, { total: 3, available: 1, held: 1, booked: 1, blocked: 0 });
  assert.equal(result.body.data.report.bookingCount, 1);
  assert.equal(result.body.data.report.ticketCount, 1);
  assert.equal(result.body.data.report.simulatedTotal, 1000);
  assert.equal(result.body.data.report.bookings[0].customer.email, customer.record.email);
  await request(app).get(url).set("Authorization", stranger.token).expect(403);
  await request(app).get(url).set("Authorization", customer.token).expect(403);
  await request(app).get(url).set("Authorization", admin.token).expect(200);
  await User.updateOne({ _id: organizer.record._id }, { $set: { role: "customer" } });
  await request(app).get(url).set("Authorization", organizer.token).expect(403);
  await request(app).get("/api/v1/organizer/events").set("Authorization", organizer.token).expect(403);
});

test("only admins may view platform information and change organizer access with an audit record", async () => {
  const admin = await user("admin", "admin");
  const organizer = await user("organizer", "organizer");
  const customer = await user("customer", "customer");
  await request(app).get("/api/v1/admin/overview").set("Authorization", organizer.token).expect(403);
  const overview = await request(app).get("/api/v1/admin/overview").set("Authorization", admin.token).expect(200);
  assert.equal(overview.body.data.users.length, 3);
  assert.equal(overview.body.data.users.some((item: Record<string, unknown>) => "passwordHash" in item), false);
  await request(app).patch(`/api/v1/admin/users/${customer.record.id}/role`).set("Authorization", organizer.token).send({ role: "organizer" }).expect(403);
  await request(app).patch(`/api/v1/admin/users/${customer.record.id}/role`).set("Authorization", admin.token).send({ role: "organizer" }).expect(200);
  assert.equal((await User.findById(customer.record._id))?.role, "organizer");
  const audit = await mongoose.connection.collection("roleaudits").findOne({ targetId: customer.record._id });
  assert.equal(audit?.actorId.toString(), admin.record.id);
  assert.equal(audit?.oldRole, "customer");
  assert.equal(audit?.newRole, "organizer");
  await request(app).patch(`/api/v1/admin/users/${admin.record.id}/role`).set("Authorization", admin.token).send({ role: "customer" }).expect(403);
});

test("admin can cancel an event and it cannot be republished", async () => {
  const admin = await user("admin", "admin");
  const organizer = await user("organizer", "organizer");
  const customer = await user("customer", "customer");
  const venueId = new mongoose.Types.ObjectId();
  const event = await Event.create({ organizerId: organizer.record._id, venueId, title: "Concert", category: "Music", startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000), timezone: "Asia/Karachi", status: "published", currency: "PKR", sectionPrices: [{ section: "A", amount: 1000 }] });
  const seat = await EventSeat.create({ eventId: event._id, venueId, seatKey: "A:A:1", section: "A", row: "A", number: 1, label: "A-01", gridRow: 1, gridColumn: 1, price: 1000 });
  const held = await request(app).post(`/api/v1/events/${event.id}/holds`).set("Authorization", customer.token).send({ seatIds: [seat.id], idempotencyKey: crypto.randomUUID() }).expect(201);
  await request(app).post(`/api/v1/admin/events/${event.id}/cancel`).set("Authorization", organizer.token).expect(403);
  await request(app).post(`/api/v1/admin/events/${event.id}/cancel`).set("Authorization", admin.token).expect(200);
  assert.equal((await Event.findById(event._id))?.status, "cancelled");
  await request(app).post("/api/v1/bookings/checkout").set("Authorization", customer.token).send({ holdId: held.body.data.hold.id, amount: 1000 }).expect(409);
  await request(app).post(`/api/v1/organizer/events/${event.id}/publish`).set("Authorization", organizer.token).expect(409);
});

test("development demo seeding does not undo an administrator's organizer revocation", async () => {
  const { seedDevelopmentDemoUsers } = await import("../src/config/demo-users.js");
  await seedDevelopmentDemoUsers();
  await User.updateOne({ email: "organizer@seatlock.demo" }, { $set: { role: "customer" } });
  await seedDevelopmentDemoUsers();
  assert.equal((await User.findOne({ email: "organizer@seatlock.demo" }))?.role, "customer");
});
