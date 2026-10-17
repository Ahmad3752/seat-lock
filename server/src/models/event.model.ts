import { randomUUID } from "node:crypto";
import { Schema, model, type InferSchemaType } from "mongoose";

function makeSlug(title: string) {
  const base = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "event";
  return `${base}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

const sectionPriceSchema = new Schema({
  section: { type: String, required: true, trim: true, maxlength: 20 },
  amount: { type: Number, required: true, min: 0, validate: Number.isInteger },
}, { _id: false });

const eventSchema = new Schema({
  organizerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  venueId: { type: Schema.Types.ObjectId, ref: "Venue", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  slug: { type: String, required: true, unique: true, sparse: true, immutable: true, index: true, default: function (this: { title: string }) { return makeSlug(this.title); } },
  description: { type: String, trim: true, maxlength: 2_000, default: "" },
  category: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  imageUrl: { type: String, trim: true, maxlength: 2_000, default: "" },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  timezone: { type: String, required: true, trim: true, maxlength: 80 },
  saleStartsAt: { type: Date },
  saleEndsAt: { type: Date },
  status: { type: String, enum: ["draft", "published", "cancelled"], default: "draft", index: true },
  currency: { type: String, required: true, uppercase: true, trim: true, enum: ["PKR"] },
  sectionPrices: { type: [sectionPriceSchema], required: true, validate: [(prices: unknown[]) => prices.length > 0, "At least one section price is required."] },
}, { timestamps: true });

eventSchema.index({ organizerId: 1, startsAt: -1 });
eventSchema.index({ status: 1, startsAt: 1 });

export type EventDocument = InferSchemaType<typeof eventSchema>;
export const Event = model("Event", eventSchema);
