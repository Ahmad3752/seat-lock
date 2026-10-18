import { Schema, model } from "mongoose";

const schema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  targetId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  oldRole: { type: String, required: true },
  newRole: { type: String, required: true },
}, { timestamps: true });
export const RoleAudit = model("RoleAudit", schema);
