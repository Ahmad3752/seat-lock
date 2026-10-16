import { Schema, model, type InferSchemaType } from "mongoose";

export type HoldStatus = "active" | "expired" | "converted" | "released";

const holdSeatSnapshotSchema = new Schema({
  seatId: { type: Schema.Types.ObjectId, ref: "EventSeat", required: true },
  label: { type: String, required: true },
  price: { type: Number, required: true, min: 0, validate: Number.isInteger },
}, { _id: false });

export type HoldSeatSnapshot = InferSchemaType<typeof holdSeatSnapshotSchema>;

const seatHoldSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
  customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  seatIds: { type: [Schema.Types.ObjectId], required: true },
  status: { type: String, enum: ["active", "expired", "converted", "released"], required: true, default: "active" },
  expiresAt: { type: Date, required: true },
  idempotencyKey: { type: String, required: true },
  tokenHash: { type: String, required: true },
  snapshots: { type: [holdSeatSnapshotSchema], required: true },
  total: { type: Number, required: true, min: 0, validate: Number.isInteger },
  currency: { type: String, required: true, uppercase: true, trim: true, minlength: 3, maxlength: 3 },
}, { timestamps: true });

seatHoldSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
seatHoldSchema.index({ status: 1, expiresAt: 1 });

export type SeatHoldDocument = InferSchemaType<typeof seatHoldSchema>;
export const SeatHold = model("SeatHold", seatHoldSchema);
