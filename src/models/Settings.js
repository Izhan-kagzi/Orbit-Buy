const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

/**
 * A tiny key/value settings collection. Right now it only holds the
 * maintenance-mode config, but the `key` field leaves room to add more
 * site-wide settings later without another migration.
 */
const staffStampSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    name: { type: String, default: null },
  },
  { _id: false }
);

const maintenanceSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },

    // Optional window. Leaving either blank means "no bound on that side" —
    // e.g. enabled + startTime only = maintenance starts at that time and
    // stays on until an admin flips it off.
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },

    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: [300, "Maintenance message is too long."],
    },

    updatedBy: { type: staffStampSchema, default: () => ({}) },
  },
  { _id: false }
);

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    maintenance: { type: maintenanceSchema, default: () => ({}) },
  },
  baseOptions
);

module.exports = mongoose.model("Settings", settingsSchema);