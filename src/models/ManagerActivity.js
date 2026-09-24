const crypto = require("crypto");
const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

/**
 * Audit trail for manager sessions and API activity.
 *
 * User ids in Orbit Buy are strings (UUIDs), so managerId is intentionally
 * stored as a string instead of an ObjectId reference.
 */
const managerActivitySchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    managerId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["login", "logout", "request"],
      required: true,
      index: true,
    },
    action: {
      type: String,
      default: "",
      trim: true,
    },
    method: {
      type: String,
      default: "",
      uppercase: true,
    },
    path: {
      type: String,
      default: "",
    },
    statusCode: {
      type: Number,
      default: null,
    },
    ip: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
  },
  { ...baseOptions, _id: false }
);

// The activity page normally asks for the newest entries first.
managerActivitySchema.index({ managerId: 1, createdAt: -1 });

module.exports = mongoose.model("ManagerActivity", managerActivitySchema);
