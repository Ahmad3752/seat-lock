import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import request from "supertest";
import { Types } from "mongoose";
import { installTestDatabase } from "./helpers/database.js";

process.env.MONGODB_URI = "mongodb://unused-for-http-tests";
process.env.JWT_ACCESS_SECRET = "test-access-secret";

const [{ createApp }, { Event }, { EventSeat }, { Venue }] = await Promise.all([
  import("../src/app.js"),
  import("../src/models/event.model.js"),
  import("../src/models/event-seat.model.js"),
  import("../src/models/venue.model.js"),
]);

installTestDatabase();

const app = createApp();
const organizerId = new Types.ObjectId();
let venueId: Types.ObjectId;
let publishedId: Types.ObjectId;
const future = (days: number) => new Date(Date.now() + days * 86_400_000);

async function createEvent(overrides: Record<string, unknown>) {
  return Event.create({
    organizerId,
    venueId,
    title: "City Music.* Night",
    slug: "city-music-night",
    description: "A public concert for event discovery testing.",
    category: "Music",
    imageUrl: "https://example.com/poster.jpg",
    startsAt: future(5),
    endsAt: future(5.2),
    timezone: "Asia/Karachi",
    status: "published",
    currency: "PKR",
    sectionPrices: [{ section: "A", amount: 2500 }, { section: "B", amount: 1500 }],
    ...overrides,
  });
}

beforeEach(async () => {
  const venue = await Venue.create({
    organizerId,
    name: "Karachi Arts Hall",
    address: "Main Street, Karachi",
    seats: [{ seatKey: "A:A:1", section: "A", row: "A", number: 1, label: "A-01", gridRow: 1, gridColumn: 1 }],
  });
  venueId = venue._id;
  const published = await createEvent({ slug: "city-music-night" });
  publishedId = published._id;
});

test("public event listing exposes only upcoming published events and supports escaped filters", async () => {
  await createEvent({ title: "Music Gala", slug: "music-gala", startsAt: future(7), endsAt: future(7.2) });
  await createEvent({ title: "Draft Music.*", slug: "draft-music", status: "draft" });
  await createEvent({ title: "Cancelled Music.*", slug: "cancelled-music", status: "cancelled" });
  await createEvent({ title: "Past Music.*", slug: "past-music", startsAt: future(-2), endsAt: future(-1) });

  const response = await request(app).get("/api/v1/events").query({ q: "Music.*", category: "Music", city: "Karachi" }).expect(200);

  assert.deepEqual(response.body.data.events.map((event: { slug: string }) => event.slug), ["city-music-night"]);
  assert.deepEqual(Object.keys(response.body.data.events[0]).sort(), ["category", "id", "posterUrl", "priceFrom", "slug", "startsAt", "title", "venue"]);
});

test("public event listing rejects invalid date ranges", async () => {
  const invalid = await request(app).get("/api/v1/events").query({ from: "not-a-date" }).expect(422);
  assert.equal(invalid.body.error.code, "VALIDATION_ERROR");

  const reversed = await request(app).get("/api/v1/events").query({ from: "2027-06-10", to: "2027-06-01" }).expect(422);
  assert.equal(reversed.body.error.code, "VALIDATION_ERROR");

  const impossible = await request(app).get("/api/v1/events").query({ from: "2027-02-30" }).expect(422);
  assert.equal(impossible.body.error.code, "VALIDATION_ERROR");
});

test("unpublished and missing public event details and seat maps return not found", async () => {
  const draft = await createEvent({ slug: "private-draft", status: "draft" });

  for (const path of ["/api/v1/events/private-draft", "/api/v1/events/missing-event", `/api/v1/events/${draft._id}/seats`, `/api/v1/events/${new Types.ObjectId()}/seats`]) {
    const response = await request(app).get(path).expect(404);
    assert.equal(response.body.error.code, "NOT_FOUND");
  }
});

test("malformed public event slugs return the standard not found envelope", async () => {
  const response = await request(app).get("/api/v1/events/%ZZ").expect(404);
  assert.equal(response.body.error.code, "NOT_FOUND");
});

test("legacy events and seats receive safe public fallbacks", async () => {
  const legacyId = new Types.ObjectId();
  await Event.collection.insertOne({
    _id: legacyId,
    organizerId,
    venueId,
    title: "Legacy public event",
    category: "Music",
    imageUrl: "",
    startsAt: future(9),
    endsAt: future(9.2),
    timezone: "Asia/Karachi",
    status: "published",
    currency: "PKR",
    sectionPrices: [{ section: "A", amount: 1800 }],
  });
  await EventSeat.collection.insertOne({ eventId: legacyId, venueId, seatKey: "A:A:1", section: "A", row: "A", number: 1, label: "A-01", gridRow: 1, gridColumn: 1, price: 1800, status: "available" });

  const catalogue = await request(app).get("/api/v1/events").expect(200);
  assert.equal(catalogue.body.data.events.find((event: { id: string }) => event.id === legacyId.toString()).slug, legacyId.toString());

  const detail = await request(app).get(`/api/v1/events/${legacyId}`).expect(200);
  assert.equal(detail.body.data.event.description, "");
  const seats = await request(app).get(`/api/v1/events/${legacyId}/seats`).expect(200);
  assert.equal(seats.body.data.seats[0].type, "standard");
  assert.deepEqual(seats.body.data.seats[0].accessibility, { isAccessible: false });
});

test("public seat maps exclude hold, booking, and audit data", async () => {
  await EventSeat.collection.insertOne({
    eventId: publishedId,
    venueId,
    seatKey: "A:A:1",
    section: "A",
    row: "A",
    number: 1,
    label: "A-01",
    gridRow: 1,
    gridColumn: 1,
    type: "wheelchair",
    isAccessible: true,
    price: 2500,
    status: "available",
    holdTokenHash: "secret-hash",
    holdOwnerId: new Types.ObjectId(),
    bookingId: new Types.ObjectId(),
    customerId: new Types.ObjectId(),
    auditTrail: ["internal"],
  });

  const response = await request(app).get(`/api/v1/events/${publishedId}/seats`).expect(200);
  const seat = response.body.data.seats[0];
  assert.deepEqual(Object.keys(seat).sort(), ["accessibility", "id", "label", "number", "price", "row", "section", "state", "type", "x", "y"]);
  assert.deepEqual(seat.accessibility, { isAccessible: true });
  assert.equal("holdTokenHash" in seat || "holdOwnerId" in seat || "bookingId" in seat || "customerId" in seat || "auditTrail" in seat, false);
});

test("expired holds appear available without exposing hold metadata", async () => {
  await EventSeat.create({ eventId: publishedId, venueId, seatKey: "A:A:1", section: "A", row: "A", number: 1, label: "A-01", gridRow: 1, gridColumn: 1, price: 2500, status: "held", holdExpiresAt: new Date(Date.now() - 1000), holdTokenHash: "secret" });
  const response = await request(app).get(`/api/v1/events/${publishedId}/seats`).expect(200);
  assert.equal(response.body.data.seats[0].state, "available");
  assert.equal("holdTokenHash" in response.body.data.seats[0], false);
});
