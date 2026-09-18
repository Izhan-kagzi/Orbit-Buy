const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    products: { type: [{ type: String, ref: "Product" }], default: [] },
  },
  baseOptions
);

module.exports = mongoose.model("Wishlist", wishlistSchema);
