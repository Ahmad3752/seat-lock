import { Schema, model, Types } from "mongoose";

const refreshSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null },
  userAgent: { type: String, default: null, maxlength: 500 },
}, { timestamps: true });

export interface RefreshSessionRecord { _id: Types.ObjectId; userId: Types.ObjectId; expiresAt: Date; revokedAt: Date | null; }
export const RefreshSession = model("RefreshSession", refreshSessionSchema);
