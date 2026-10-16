import { Schema, model, type InferSchemaType } from "mongoose";

const eventSeatSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  venueId: { type: Schema.Types.ObjectId, ref: "Venue", required: true },
  seatKey: { type: String, required: true },
  section: { type: String, required: true },
  row: { type: String, required: true },
  number: { type: Number, required: true, min: 1 },
  label: { type: String, required: true },
  gridRow: { type: Number, required: true, min: 1 },
  gridColumn: { type: Number, required: true, min: 1 },
  type: { type: String, required: true, trim: true, default: "standard" },
  isAccessible: { type: Boolean, required: true, default: false },
  price: { type: Number, required: true, min: 0, validate: Number.isInteger },
  status: { type: String, enum: ["available", "held", "booked", "blocked"], default: "available", index: true },
  holdId: { type: Schema.Types.ObjectId, ref: "SeatHold" },
  holdTokenHash: { type: String },
  holdExpiresAt: { type: Date },
  version: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
}, { timestamps: true });

eventSeatSchema.index({ eventId: 1, seatKey: 1 }, { unique: true });
eventSeatSchema.index({ eventId: 1, status: 1 });
eventSeatSchema.index({ eventId: 1, status: 1, holdExpiresAt: 1 });

export type EventSeatDocument = InferSchemaType<typeof eventSeatSchema>;
export const EventSeat = model("EventSeat", eventSeatSchema);
