import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../src/errors/app-error.js";
import { Event } from "../src/models/event.model.js";
import { eventInput } from "../src/modules/organizer/organizer.validation.js";

const validInput = {
  venueId: "507f1f77bcf86cd799439011",
  title: "Public event fields",
  description: "A customer-facing event description.",
  category: "Music",
  imageUrl: "",
  startsAt: "2027-04-12T18:00:00.000Z",
  endsAt: "2027-04-12T21:00:00.000Z",
  saleStartsAt: "2027-03-01T00:00:00.000Z",
  saleEndsAt: "2027-04-12T17:00:00.000Z",
  timezone: "Asia/Karachi",
  currency: "PKR",
  sectionPrices: [{ section: "A", amount: 2500 }],
};

test("public event fields accept descriptions and sale windows", () => {
  const input = eventInput(validInput);
  assert.equal(input.description, validInput.description);
  assert.deepEqual(input.saleStartsAt, new Date(validInput.saleStartsAt));
  assert.deepEqual(input.saleEndsAt, new Date(validInput.saleEndsAt));
});

test("public event fields reject a reversed sale window", () => {
  assert.throws(() => eventInput({ ...validInput, saleEndsAt: "2027-02-28T00:00:00.000Z" }), (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR");
});

test("public event fields allow an optional sale window to be cleared", () => {
  const input = eventInput({ ...validInput, saleStartsAt: "", saleEndsAt: "" }, true);
  assert.equal(input.saleStartsAt, null);
  assert.equal(input.saleEndsAt, null);
});

test("public event fields create a URL-safe slug", () => {
  const event = new Event({
    organizerId: "507f1f77bcf86cd799439012",
    venueId: validInput.venueId,
    title: "Public Event: Fields!",
    category: validInput.category,
    imageUrl: validInput.imageUrl,
    startsAt: validInput.startsAt,
    endsAt: validInput.endsAt,
    timezone: validInput.timezone,
    currency: validInput.currency,
    sectionPrices: validInput.sectionPrices,
  });
  const slug = (event as unknown as { slug?: string }).slug;
  assert.match(slug ?? "", /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{8}$/);
});
