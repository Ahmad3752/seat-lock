import type { RequestHandler } from "express";
import { Types } from "mongoose";
import { AppError } from "../../errors/app-error.js";
import { assertOrganizerOwnership } from "../../middleware/ownership.js";
import { Event } from "../../models/event.model.js";
import { EventSeat } from "../../models/event-seat.model.js";
import { Venue } from "../../models/venue.model.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { eventInput, venueInput } from "./organizer.validation.js";

type VenueSeat = { seatKey: string; section: string; row: string; number: number; label: string; gridRow: number; gridColumn: number };
type SectionPrice = { section: string; amount: number };

function objectId(value: unknown, label: string) {
  if (typeof value !== "string") throw new AppError(404, "NOT_FOUND", `${label} was not found.`);
  if (!Types.ObjectId.isValid(value)) throw new AppError(404, "NOT_FOUND", `${label} was not found.`);
  return value;
}

function venueDto(venue: { _id: Types.ObjectId; name: string; address: string; seats: VenueSeat[]; organizerId: Types.ObjectId; createdAt: Date }) {
  return { id: venue._id.toString(), organizerId: venue.organizerId.toString(), name: venue.name, address: venue.address, seats: venue.seats, seatCount: venue.seats.length, createdAt: venue.createdAt };
}

function eventDto(event: { _id: Types.ObjectId; organizerId: Types.ObjectId; venueId: Types.ObjectId; title: string; slug: string; description: string; category: string; imageUrl: string; startsAt: Date; endsAt: Date; saleStartsAt?: Date | null; saleEndsAt?: Date | null; timezone: string; status: string; currency: string; sectionPrices: SectionPrice[]; createdAt: Date }) {
  return {
    id: event._id.toString(), organizerId: event.organizerId.toString(), venueId: event.venueId.toString(), title: event.title, slug: event.slug, description: event.description,
    category: event.category, imageUrl: event.imageUrl, startsAt: event.startsAt, endsAt: event.endsAt, saleStartsAt: event.saleStartsAt, saleEndsAt: event.saleEndsAt, timezone: event.timezone,
    status: event.status, currency: event.currency, sectionPrices: event.sectionPrices, createdAt: event.createdAt,
  };
}

function buildVenueSeats(sections: string[], rows: string[], seatsPerRow: number): VenueSeat[] {
  return sections.flatMap((section, sectionIndex) => rows.flatMap((row, rowIndex) => Array.from({ length: seatsPerRow }, (_, columnIndex) => {
    const number = columnIndex + 1;
    return {
      seatKey: `${section}:${row}:${number}`,
      section,
      row,
      number,
      label: `${row}-${String(number).padStart(2, "0")}`,
      gridRow: sectionIndex * rows.length + rowIndex + 1,
      gridColumn: number,
    };
  })));
}

function priceMap(venueSeats: VenueSeat[], sectionPrices: SectionPrice[]) {
  const venueSections = new Set(venueSeats.map((seat) => seat.section));
  const prices = new Map(sectionPrices.map((price) => [price.section, price.amount]));
  const missing = [...venueSections].filter((section) => !prices.has(section));
  const unused = [...prices.keys()].filter((section) => !venueSections.has(section));
  if (missing.length || unused.length) throw new AppError(422, "VALIDATION_ERROR", "Set one ticket price for every venue section.");
  return prices;
}

function ensureChronological(startsAt: Date, endsAt: Date) {
  if (startsAt >= endsAt) throw new AppError(422, "VALIDATION_ERROR", "End date must be after the start date.");
}

function ensureSaleWindow(saleStartsAt?: Date | null, saleEndsAt?: Date | null) {
  if (saleStartsAt && saleEndsAt && saleStartsAt >= saleEndsAt) throw new AppError(422, "VALIDATION_ERROR", "Sale end date must be after the sale start date.");
}

function organizerFilter(user: NonNullable<Express.Request["user"]>) {
  return user.role === "admin" ? {} : { organizerId: user.sub };
}

export const createVenue: RequestHandler = asyncHandler(async (req, res) => {
  const { name, address, sections, rows, seatsPerRow } = venueInput(req.body);
  const venue = await Venue.create({ organizerId: req.user!.sub, name, address, seats: buildVenueSeats(sections, rows, seatsPerRow) });
  res.status(201).json({ data: { venue: venueDto(venue) } });
});

export const listVenues: RequestHandler = asyncHandler(async (req, res) => {
  const venues = await Venue.find(organizerFilter(req.user!)).sort({ createdAt: -1 });
  res.status(200).json({ data: { venues: venues.map(venueDto) } });
});

export const getVenue: RequestHandler = asyncHandler(async (req, res) => {
  const venue = await Venue.findById(objectId(req.params.venueId, "Venue"));
  if (!venue) throw new AppError(404, "NOT_FOUND", "Venue was not found.");
  assertOrganizerOwnership(venue.organizerId, req.user!);
  res.status(200).json({ data: { venue: venueDto(venue) } });
});

export const updateVenue: RequestHandler = asyncHandler(async (req, res) => {
  const venue = await Venue.findById(objectId(req.params.venueId, "Venue"));
  if (!venue) throw new AppError(404, "NOT_FOUND", "Venue was not found.");
  assertOrganizerOwnership(venue.organizerId, req.user!);
  if (await Event.exists({ venueId: venue._id })) throw new AppError(409, "VENUE_IN_USE", "A venue layout cannot change after an event has generated inventory from it.");
  const { name, address, sections, rows, seatsPerRow } = venueInput(req.body);
  venue.name = name;
  venue.address = address;
  venue.seats = buildVenueSeats(sections, rows, seatsPerRow) as unknown as typeof venue.seats;
  await venue.save();
  res.status(200).json({ data: { venue: venueDto(venue) } });
});

export const createEvent: RequestHandler = asyncHandler(async (req, res) => {
  const input = eventInput(req.body);
  const venueId = objectId(input.venueId as string, "Venue");
  const venue = await Venue.findById(venueId);
  if (!venue) throw new AppError(404, "NOT_FOUND", "Venue was not found.");
  assertOrganizerOwnership(venue.organizerId, req.user!);
  const startsAt = input.startsAt as Date;
  const endsAt = input.endsAt as Date;
  const sectionPrices = input.sectionPrices as SectionPrice[];
  ensureChronological(startsAt, endsAt);
  ensureSaleWindow(input.saleStartsAt as Date | undefined, input.saleEndsAt as Date | undefined);
  const prices = priceMap(venue.seats as VenueSeat[], sectionPrices);

  const event = new Event({ ...input, organizerId: req.user!.sub, venueId });
  try {
    await event.save();
    await EventSeat.insertMany((venue.seats as VenueSeat[]).map((seat) => ({
      eventId: event._id,
      venueId: venue._id,
      seatKey: seat.seatKey,
      section: seat.section,
      row: seat.row,
      number: seat.number,
      label: seat.label,
      gridRow: seat.gridRow,
      gridColumn: seat.gridColumn,
      type: "standard",
      isAccessible: false,
      price: prices.get(seat.section),
      status: "available",
    })), { ordered: true });
  } catch (error) {
    await EventSeat.deleteMany({ eventId: event._id });
    await Event.deleteOne({ _id: event._id });
    throw error;
  }
  res.status(201).json({ data: { event: eventDto(event) } });
});

export const listEvents: RequestHandler = asyncHandler(async (req, res) => {
  const events = await Event.find(organizerFilter(req.user!)).sort({ startsAt: -1 });
  res.status(200).json({ data: { events: events.map(eventDto) } });
});

export const getEvent: RequestHandler = asyncHandler(async (req, res) => {
  const event = await Event.findById(objectId(req.params.eventId, "Event"));
  if (!event) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  assertOrganizerOwnership(event.organizerId, req.user!);
  res.status(200).json({ data: { event: eventDto(event) } });
});

export const updateEvent: RequestHandler = asyncHandler(async (req, res) => {
  if (typeof req.body === "object" && req.body !== null && "venueId" in req.body) throw new AppError(422, "VENUE_IMMUTABLE", "An event venue cannot be changed after inventory is generated.");
  const event = await Event.findById(objectId(req.params.eventId, "Event"));
  if (!event) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  assertOrganizerOwnership(event.organizerId, req.user!);
  if (event.status !== "draft") throw new AppError(409, "EVENT_PUBLISHED", "Published events cannot be edited.");
  const updates = eventInput(req.body, true);
  const startsAt = (updates.startsAt as Date | undefined) ?? event.startsAt;
  const endsAt = (updates.endsAt as Date | undefined) ?? event.endsAt;
  ensureChronological(startsAt, endsAt);
  const saleStartsAt = (updates.saleStartsAt as Date | undefined) ?? event.saleStartsAt;
  const saleEndsAt = (updates.saleEndsAt as Date | undefined) ?? event.saleEndsAt;
  ensureSaleWindow(saleStartsAt, saleEndsAt);
  if (updates.sectionPrices) {
    const venue = await Venue.findById(event.venueId);
    if (!venue) throw new AppError(409, "VENUE_UNAVAILABLE", "The event venue is no longer available.");
    const prices = priceMap(venue.seats as VenueSeat[], updates.sectionPrices as SectionPrice[]);
    await EventSeat.bulkWrite([...prices.entries()].map(([section, price]) => ({ updateMany: { filter: { eventId: event._id, section }, update: { $set: { price } } } })));
  }
  Object.assign(event, updates);
  await event.save();
  res.status(200).json({ data: { event: eventDto(event) } });
});

export const publishEvent: RequestHandler = asyncHandler(async (req, res) => {
  const event = await Event.findById(objectId(req.params.eventId, "Event"));
  if (!event) throw new AppError(404, "NOT_FOUND", "Event was not found.");
  assertOrganizerOwnership(event.organizerId, req.user!);
  if (event.status === "published") return res.status(200).json({ data: { event: eventDto(event) } });
  const venue = await Venue.findById(event.venueId);
  if (!venue) throw new AppError(409, "VENUE_UNAVAILABLE", "The event venue is no longer available.");
  ensureChronological(event.startsAt, event.endsAt);
  priceMap(venue.seats as VenueSeat[], event.sectionPrices as SectionPrice[]);
  const eventSeatCount = await EventSeat.countDocuments({ eventId: event._id });
  if (eventSeatCount !== venue.seats.length) throw new AppError(409, "INVENTORY_INCOMPLETE", "Event seat inventory is incomplete and cannot be published.");
  event.status = "published";
  await event.save();
  res.status(200).json({ data: { event: eventDto(event) } });
});
