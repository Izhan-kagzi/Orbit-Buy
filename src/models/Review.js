const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

/**
 * A customer review of a product, plus the single staff reply that an
 * admin or a manager can attach to it.
 */
const replySchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    repliedBy: { type: String, ref: "User", default: null },
    repliedByName: { type: String, default: "Orbit Buy Team" },
    repliedByRole: { type: String, default: "admin" },
    repliedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      ref: "Product",
      required: [true, "Product ID is required."],
      index: true,
    },
    userId: {
      type: String,
      ref: "User",
      required: [true, "User ID is required."],
      index: true,
    },
    // Denormalised so a deleted user/product never blanks out the
    // admin reviews table.
    userName: { type: String, default: "Customer" },
    userEmail: { type: String, default: "" },
    productName: { type: String, default: "Product" },

    rating: {
      type: Number,
      required: [true, "Rating is required."],
      min: [1, "Rating must be between 1 and 5."],
      max: [5, "Rating must be between 1 and 5."],
    },
    comment: {
      type: String,
      required: [true, "Review comment is required."],
      trim: true,
      maxlength: [2000, "Review comment is too long."],
    },
    approved: { type: Boolean, default: true, index: true },
    verifiedPurchase: { type: Boolean, default: false },

    reply: { type: replySchema, default: null },
  },
  baseOptions
);

// One review per customer per product.
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ createdAt: -1 });

/**
 * Keeps Product.rating / Product.reviews in sync with the approved
 * reviews that actually exist. Called after any create/delete/approve.
 */
reviewSchema.statics.syncProductRating = async function syncProductRating(
  productId
) {
  const Product = mongoose.model("Product");

  const [stats] = await this.aggregate([
    { $match: { productId: String(productId), approved: true } },
    {
      $group: {
        _id: "$productId",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  await Product.findByIdAndUpdate(productId, {
    rating: stats ? Number(stats.avgRating.toFixed(1)) : 4.5,
    reviews: stats ? stats.count : 0,
  });
};

module.exports = mongoose.model("Review", reviewSchema);
