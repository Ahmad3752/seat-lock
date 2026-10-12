import { Schema, model, type InferSchemaType } from "mongoose";

const venueSeatSchema = new Schema({
  seatKey: { type: String, required: true },
  section: { type: String, required: true },
  row: { type: String, required: true },
  number: { type: Number, required: true, min: 1 },
  label: { type: String, required: true },
  gridRow: { type: Number, required: true, min: 1 },
  gridColumn: { type: Number, required: true, min: 1 },
}, { _id: false });

const venueSchema = new Schema({
  organizerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  address: { type: String, required: true, trim: true, minlength: 2, maxlength: 250 },
  seats: { type: [venueSeatSchema], required: true, validate: [(seats: unknown[]) => seats.length > 0, "A venue must contain at least one seat."] },
}, { timestamps: true });

venueSchema.index({ organizerId: 1, name: 1 });

export type VenueDocument = InferSchemaType<typeof venueSchema>;
export const Venue = model("Venue", venueSchema);
