import { Schema, model, type InferSchemaType } from "mongoose";

const sectionPriceSchema = new Schema({
  section: { type: String, required: true, trim: true, maxlength: 20 },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });

const eventSchema = new Schema({
  organizerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  venueId: { type: Schema.Types.ObjectId, ref: "Venue", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 150 },
  category: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  imageUrl: { type: String, trim: true, maxlength: 2_000, default: "" },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  timezone: { type: String, required: true, trim: true, maxlength: 80 },
  status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
  currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
  sectionPrices: { type: [sectionPriceSchema], required: true, validate: [(prices: unknown[]) => prices.length > 0, "At least one section price is required."] },
}, { timestamps: true });

eventSchema.index({ organizerId: 1, startsAt: -1 });

export type EventDocument = InferSchemaType<typeof eventSchema>;
export const Event = model("Event", eventSchema);
