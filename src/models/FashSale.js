const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

/**
 * Flash sales are a real collection now, not a single settings blob —
 * an admin or a manager can add as many as they like, each with its own
 * start/end date and time, and delete any one of them individually.
 */
const staffStampSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    name: { type: String, default: null },
    role: { type: String, default: null },
  },
  { _id: false }
);

const flashSaleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Flash Sale title is required."],
      trim: true,
      maxlength: [120, "Flash Sale title is too long."],
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Flash Sale description is too long."],
    },
    images: { type: [String], default: [] },

    // Percentage shown on the storefront banner (optional).
    discountPercent: { type: Number, default: null, min: 0, max: 100 },

    // Optional: restrict the sale to specific products.
    products: { type: [{ type: String, ref: "Product" }], default: [] },

    startTime: {
      type: Date,
      required: [true, "Flash Sale start date/time is required."],
    },
    endTime: {
      type: Date,
      required: [true, "Flash Sale end date/time is required."],
    },

    active: { type: Boolean, default: true, index: true },

    createdBy: { type: staffStampSchema, default: () => ({}) },
    updatedBy: { type: staffStampSchema, default: () => ({}) },
  },
  baseOptions
);

flashSaleSchema.index({ startTime: 1, endTime: 1 });

flashSaleSchema.pre("validate", function validateWindow(next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    return next(
      new Error("Flash Sale end time must be after the start time.")
    );
  }
  next();
});

// "upcoming" | "active" | "ended" | "inactive"
flashSaleSchema.virtual("status").get(function status() {
  if (!this.active) return "inactive";

  const now = Date.now();
  if (this.startTime && now < this.startTime.getTime()) return "upcoming";
  if (this.endTime && now >= this.endTime.getTime()) return "ended";
  return "active";
});

flashSaleSchema.virtual("isRunning").get(function isRunning() {
  return this.status === "active";
});

module.exports = mongoose.model("FlashSale", flashSaleSchema);
