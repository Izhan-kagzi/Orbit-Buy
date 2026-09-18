const crypto = require("crypto");
const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

const couponSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => `coupon-${crypto.randomUUID().slice(0, 8)}`,
    },
    code: {
      type: String,
      required: [true, "code is required."],
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountType: {
      type: String,
      enum: {
        values: ["flat", "percent"],
        message: 'discountType must be "flat" or "percent".',
      },
      default: "flat",
    },
    discountValue: {
      type: Number,
      required: [true, "discountValue is required."],
      min: [0, "discountValue cannot be negative."],
    },
    maxDiscount: { type: Number, default: null },
    startDate: { type: Date, required: [true, "startDate is required."] },
    endDate: { type: Date, required: [true, "endDate is required."] },
    active: { type: Boolean, default: true },
  },
  { ...baseOptions, _id: false }
);

couponSchema.pre("validate", function validateDates(next) {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    return next(new Error("endDate must be after startDate."));
  }
  next();
});

module.exports = mongoose.model("Coupon", couponSchema);
