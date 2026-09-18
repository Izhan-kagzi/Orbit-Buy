const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: String, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
  },
  baseOptions
);

module.exports = mongoose.model("Cart", cartSchema);
