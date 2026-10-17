import type { RequestHandler } from "express";
import { Types } from "mongoose";
import { AppError } from "../../errors/app-error.js";
import { Event } from "../../models/event.model.js";
import { EventSeat } from "../../models/event-seat.model.js";
import { Venue } from "../../models/venue.model.js";
import { asyncHandler } from "../../utils/async-handler.js";

const MAX_FILTER_LENGTH = 100;

type VenueSummary = { _id: Types.ObjectId; name: string; address: string };
type SectionPrice = { section: string; amount: number };
type PublicEvent = {
  _id: Types.ObjectId;
  venueId: Types.ObjectId;
  title: string;
  slug?: string;
  description?: string;
  category: string;
  imageUrl: string;
  startsAt: Date;
  endsAt: Date;
  saleStartsAt?: Date | null;
  saleEndsAt?: Date | null;
  timezone: string;
  currency: string;
  sectionPrices: SectionPrice[];
};

function notFound() {
  return new AppError(404, "NOT_FOUND", "Event was not found.");
}

function routeParam(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function optionalText(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new AppError(422, "VALIDATION_ERROR", `${label} must be text.`);
  const text = value.trim();
  if (text.length > MAX_FILTER_LENGTH) throw new AppError(422, "VALIDATION_ERROR", `${label} must be ${MAX_FILTER_LENGTH} characters or fewer.`);
  return text || undefined;
}

function optionalDate(value: unknown, label: string, endOfDay = false) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new AppError(422, "VALIDATION_ERROR", `${label} must be a valid date.`);
  const calendar = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!calendar) throw new AppError(422, "VALIDATION_ERROR", `${label} must be a valid date.`);
  const [year, month, day] = calendar.slice(1).map(Number);
  const check = new Date(Date.UTC(year!, month! - 1, day!));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month! - 1 || check.getUTCDate() !== day) throw new AppError(422, "VALIDATION_ERROR", `${label} must be a valid date.`);
  const normalized = endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new AppError(422, "VALIDATION_ERROR", `${label} must be a valid date.`);
  return date;
}

function pricingSummary(prices: SectionPrice[]) {
  const amounts = prices.map((price) => price.amount);
  return { from: Math.min(...amounts), to: Math.max(...amounts), sections: prices.map((price) => ({ section: price.section, amount: price.amount })) };
}

function saleAvailability(event: PublicEvent) {
  const now = new Date();
  const isOpen = now < event.startsAt && (!event.saleStartsAt || now >= event.saleStartsAt) && (!event.saleEndsAt || now < event.saleEndsAt);
  return { startsAt: event.saleStartsAt ?? null, endsAt: event.saleEndsAt ?? null, isOpen };
}

function publicCard(event: PublicEvent, venue: VenueSummary) {
  return { id: event._id.toString(), slug: event.slug || event._id.toString(), title: event.title, category: event.category, posterUrl: event.imageUrl, startsAt: event.startsAt, priceFrom: pricingSummary(event.sectionPrices).from, venue: { name: venue.name, address: venue.address } };
}

function publicDetail(event: PublicEvent, venue: VenueSummary) {
  return {
    id: event._id.toString(), slug: event.slug || event._id.toString(), title: event.title, description: event.description || "", posterUrl: event.imageUrl, category: event.category,
    venue: { name: venue.name, address: venue.address }, startsAt: event.startsAt, endsAt: event.endsAt, timezone: event.timezone,
    currency: event.currency, sale: saleAvailability(event), pricing: pricingSummary(event.sectionPrices),
  };
}

export const listPublicEvents: RequestHandler = asyncHandler(async (req, res) => {
  const q = optionalText(req.query.q, "Search");
  const category = optionalText(req.query.category, "Category");
  const city = optionalText(req.query.city, "City");
  const from = optionalDate(req.query.from, "From date");
  const to = optionalDate(req.query.to, "To date", true);
  if (from && to && from > to) throw new AppError(422, "VALIDATION_ERROR", "From date must be before the to date.");

  let venueIds: Types.ObjectId[] | undefined;
  if (city) {
    const venues = await Venue.find({ address: { $regex: new RegExp(escapeRegex(city), "i") } }).select("_id").lean() as unknown as Array<{ _id: Types.ObjectId }>;
    venueIds = venues.map((venue) => venue._id);
  }
  const startsAt: Record<string, Date> = { $gte: from && from > new Date() ? from : new Date() };
  if (to) startsAt.$lte = to;
  const filter: Record<string, unknown> = { status: "published", startsAt };
  if (q) filter.title = { $regex: new RegExp(escapeRegex(q), "i") };
  if (category) filter.category = { $regex: new RegExp(escapeRegex(category), "i") };
  if (venueIds) filter.venueId = { $in: venueIds };

  const events = await Event.find(filter).sort({ startsAt: 1 }).lean() as unknown as PublicEvent[];
  const venues = await Venue.find({ _id: { $in: events.map((event) => event.venueId) } }).select("name address").lean() as unknown as VenueSummary[];
  const venuesById = new Map(venues.map((venue) => [venue._id.toString(), venue]));
  res.status(200).json({ data: { events: events.flatMap((event) => {
    const venue = venuesById.get(event.venueId.toString());
    return venue ? [publicCard(event, venue)] : [];
  }) } });
});

export const getPublicEvent: RequestHandler = asyncHandler(async (req, res) => {
  const now = new Date();
  const slug = routeParam(req.params.slug);
  if (!slug) throw notFound();
  const visibility: Record<string, unknown> = { status: "published", startsAt: { $gte: now } };
  visibility.$or = Types.ObjectId.isValid(slug) ? [{ slug }, { _id: slug }] : [{ slug }];
  const [event] = await Event.find(visibility).limit(1).lean() as unknown as PublicEvent[];
  if (!event) throw notFound();
  const venue = await Venue.findById(event.venueId).select("name address").lean() as unknown as VenueSummary | null;
  if (!venue) throw notFound();
  res.status(200).json({ data: { event: publicDetail(event, venue) } });
});

export const getPublicEventSeats: RequestHandler = asyncHandler(async (req, res) => {
  const eventId = routeParam(req.params.eventId);
  if (!eventId || !Types.ObjectId.isValid(eventId)) throw notFound();
  const [event] = await Event.find({ _id: eventId, status: "published", startsAt: { $gte: new Date() } }).select("_id").limit(1).lean();
  if (!event) throw notFound();
  const seats = await EventSeat.find({ eventId: event._id }).sort({ gridRow: 1, gridColumn: 1 }).lean();
  res.status(200).json({ data: { seats: seats.map((seat) => ({
    id: seat._id.toString(), label: seat.label, section: seat.section, row: seat.row, number: seat.number,
    x: seat.gridColumn, y: seat.gridRow, type: seat.type || "standard", accessibility: { isAccessible: Boolean(seat.isAccessible) }, price: seat.price,
    state: seat.status === "held" && seat.holdExpiresAt && seat.holdExpiresAt <= new Date() ? "available" : seat.status,
  })) } });
});
