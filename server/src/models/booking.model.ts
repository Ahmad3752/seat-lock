import { Schema, model, type InferSchemaType } from "mongoose";

const bookingSchema = new Schema({
  holdId: { type: Schema.Types.ObjectId, ref: "SeatHold", required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
  eventTitle: { type: String, required: true },
  startsAt: { type: Date, required: true },
  reference: { type: String, required: true, unique: true },
  seats: [{ _id: false, seatId: { type: Schema.Types.ObjectId, required: true }, label: { type: String, required: true }, price: { type: Number, required: true } }],
  total: { type: Number, required: true, min: 0, validate: Number.isInteger },
  currency: { type: String, enum: ["PKR"], required: true },
  paymentStatus: { type: String, enum: ["simulated"], required: true },
}, { timestamps: true });
bookingSchema.index({ customerId: 1, createdAt: -1 });
export type BookingDocument = InferSchemaType<typeof bookingSchema>;
export const Booking = model("Booking", bookingSchema);
