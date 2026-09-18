const crypto = require("crypto");
const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

const VALID_SLUGS = [
  "mens-shirts",
  "mens-tshirts",
  "mens-jeans",
  "mens-trackpants",
  "mens-hoodies",
  "mens-jackets",

  "women-dresses",
  "women-partywear",
  "women-jeans",
  "women-cordset",
  "women-formals",
  "women-skirts",
  "women-shirts",
  "women-jumpsuits",
];

const productSchema = new mongoose.Schema(
  {
    // Seed products use readable ids ("mh-1"), admin-created ones use
    // "custom-xxxxxxxx" — both are plain strings.
    _id: {
      type: String,
      default: () => `custom-${crypto.randomUUID().slice(0, 8)}`,
    },
    slug: {
      type: String,
      required: [true, "slug is required."],
      enum: {
        values: VALID_SLUGS,
        message: `slug must be one of: ${VALID_SLUGS.join(", ")}`,
      },
      index: true,
    },
    name: { type: String, required: [true, "name is required."], trim: true },
    brand: { type: String, default: "OrbitBuy", trim: true, index: true },
    category: {
      type: String,
      required: [true, "category is required."],
      enum: {
        values: ["Men", "Women"],
        message: 'category must be "Men" or "Women".',
      },
      index: true,
    },
    type: { type: String, default: null },
    description: { type: String, default: "" },
    sizes: { type: [String], default: ["S", "M", "L", "XL"] },
    price: {
      type: Number,
      required: [true, "price is required."],
      min: [0, "price cannot be negative."],
    },
    oldPrice: { type: Number, default: null },
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    reviews: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 20, min: 0 },
    isBestSeller: { type: Boolean, default: false, index: true },
    isNewArrival: { type: Boolean, default: false, index: true },
    image: { type: String, default: null },
    images: { type: [String], default: [] },
    videos: { type: [String], default: [] },
  },
  { ...baseOptions, _id: false }
);

// Text search across the fields the catalogue search box uses.
productSchema.index({ name: "text", description: "text", brand: "text" });
productSchema.index({ price: 1 });

module.exports = mongoose.model("Product", productSchema);
module.exports.VALID_SLUGS = VALID_SLUGS;
