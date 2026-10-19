import { Schema, model } from 'mongoose';

const sourceSchema = new Schema({ name: String, url: String }, { _id: false });
const externalEventSchema = new Schema({
  sourceKey: { type: String, required: true, unique: true },
  sourceId: { type: String, default: null },
  title: { type: String, required: true },
  category: { type: String, default: null },
  categories: { type: [String], default: [] },
  startAt: { type: Date, default: null }, endAt: { type: Date, default: null },
  datePrecision: { type: String, enum: ['date', 'datetime'], default: null },
  timezone: { type: String, default: null }, city: { type: String, default: null },
  venue: { type: String, default: null }, description: { type: String, default: null },
  posterUrl: { type: String, default: null }, price: { type: Number, min: 0, default: null },
  currency: { type: String, default: null }, organizer: { type: String, default: null },
  sources: [sourceSchema],
  status: { type: String, enum: ['published', 'needs_review', 'cancelled'], required: true },
  createdAt: Date, updatedAt: Date, lastCheckedAt: Date, lastSeenAt: Date,
}, { collection: 'external_events' });
externalEventSchema.index({ status: 1, startAt: 1 });
export const ExternalEvent = model('ExternalEvent', externalEventSchema);
