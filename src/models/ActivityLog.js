const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

const activityLogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => require("crypto").randomUUID() },
    user: { type: String, ref: "User", required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["login", "logout", "activity"],
      required: true,
      index: true,
    },
    method: { type: String, default: null },
    path: { type: String, default: null },
    action: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { ...baseOptions, _id: false }
);

activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ sessionId: 1, createdAt: -1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
