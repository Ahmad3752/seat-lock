import { Types } from "mongoose";
import { AppError } from "../../errors/app-error.js";

type SectionPrice = { section: string; amount: number };

function record(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new AppError(400, "INVALID_REQUEST", "Request body must be a JSON object.");
  return body as Record<string, unknown>;
}

function requiredText(value: unknown, label: string, minimum: number, maximum: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < minimum || text.length > maximum) throw new AppError(422, "VALIDATION_ERROR", `${label} must be between ${minimum} and ${maximum} characters.`);
  return text;
}

export function venueInput(body: unknown) {
  const input = record(body);
  const name = requiredText(input.name, "Venue name", 2, 120);
  const address = requiredText(input.address, "Venue address", 2, 250);
  const rawSections = Array.isArray(input.sections) ? input.sections : [input.section];
  const sections = rawSections.map((section) => typeof section === "string" ? section.trim().toUpperCase() : "").filter(Boolean);
  if (sections.length < 1 || sections.length > 30 || new Set(sections).size !== sections.length || sections.some((section) => !/^[A-Z0-9-]{1,20}$/.test(section))) {
    throw new AppError(422, "VALIDATION_ERROR", "Provide between 1 and 30 unique section names using letters, numbers, or hyphens.");
  }
  const suppliedRows = Array.isArray(input.rows) ? input.rows : [];
  const rows = suppliedRows.map((row) => typeof row === "string" ? row.trim().toUpperCase() : "").filter(Boolean);
  if (rows.length < 1 || rows.length > 50 || new Set(rows).size !== rows.length || rows.some((row) => !/^[A-Z0-9-]+$/.test(row))) {
    throw new AppError(422, "VALIDATION_ERROR", "Provide between 1 and 50 unique row labels using letters, numbers, or hyphens.");
  }
  const seatsPerRow = typeof input.seatsPerRow === "number" ? input.seatsPerRow : Number(input.seatsPerRow);
  if (!Number.isInteger(seatsPerRow) || seatsPerRow < 1 || seatsPerRow > 200 || rows.length * sections.length * seatsPerRow > 1_000) {
    throw new AppError(422, "VALIDATION_ERROR", "Seats per row must create between 1 and 1,000 total seats.");
  }
  return { name, address, sections, rows, seatsPerRow };
}

export function eventInput(body: unknown, partial = false) {
  const input = record(body);
  const result: Record<string, unknown> = {};
  if (!partial || "title" in input) result.title = requiredText(input.title, "Event title", 2, 150);
  if (!partial || "description" in input) result.description = requiredText(input.description, "Description", 10, 2_000);
  if (!partial || "category" in input) result.category = requiredText(input.category, "Category", 2, 60);
  if (!partial || "imageUrl" in input) {
    const imageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
    if (imageUrl.length > 2_000) throw new AppError(422, "VALIDATION_ERROR", "Image URL must be 2,000 characters or fewer.");
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) throw new AppError(422, "VALIDATION_ERROR", "Image URL must start with http:// or https://.");
    result.imageUrl = imageUrl;
  }
  if (!partial || "startsAt" in input) result.startsAt = validDate(input.startsAt, "Start date");
  if (!partial || "endsAt" in input) result.endsAt = validDate(input.endsAt, "End date");
  if (!partial || "saleStartsAt" in input) result.saleStartsAt = optionalDate(input.saleStartsAt, "Sale start date");
  if (!partial || "saleEndsAt" in input) result.saleEndsAt = optionalDate(input.saleEndsAt, "Sale end date");
  if (!partial || "timezone" in input) result.timezone = requiredText(input.timezone, "Timezone", 2, 80);
  if (!partial || "currency" in input) {
    const currency = requiredText(input.currency, "Currency", 3, 3).toUpperCase();
    if (currency !== "PKR") throw new AppError(422, "VALIDATION_ERROR", "Currency must be PKR.");
    result.currency = currency;
  }
  if (!partial || "sectionPrices" in input) result.sectionPrices = prices(input.sectionPrices);
  if ("venueId" in input && !partial) {
    if (typeof input.venueId !== "string" || !Types.ObjectId.isValid(input.venueId)) throw new AppError(422, "VALIDATION_ERROR", "Select a valid venue.");
    result.venueId = input.venueId;
  }
  if (result.saleStartsAt instanceof Date && result.saleEndsAt instanceof Date && result.saleStartsAt >= result.saleEndsAt) {
    throw new AppError(422, "VALIDATION_ERROR", "Sale end date must be after the sale start date.");
  }
  return result;
}

function validDate(value: unknown, label: string) {
  const date = value instanceof Date ? value : new Date(typeof value === "string" ? value : "");
  if (Number.isNaN(date.getTime())) throw new AppError(422, "VALIDATION_ERROR", `${label} must be valid.`);
  return date;
}

function optionalDate(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return validDate(value, label);
}

function prices(value: unknown): SectionPrice[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) throw new AppError(422, "VALIDATION_ERROR", "Provide at least one section price.");
  const result = value.map((item) => {
    if (typeof item !== "object" || item === null) throw new AppError(422, "VALIDATION_ERROR", "Each section price must be valid.");
    const price = item as Record<string, unknown>;
    const section = requiredText(price.section, "Price section", 1, 20).toUpperCase();
    const amount = typeof price.amount === "number" ? price.amount : Number(price.amount);
    if (!Number.isInteger(amount) || amount < 0 || amount > 10_000_000) throw new AppError(422, "VALIDATION_ERROR", "Each ticket price must be a valid non-negative whole-rupee amount.");
    return { section, amount };
  });
  if (new Set(result.map((price) => price.section)).size !== result.length) throw new AppError(422, "VALIDATION_ERROR", "Each section can have only one price.");
  return result;
}
