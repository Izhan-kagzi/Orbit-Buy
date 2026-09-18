const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

function generateOrderId() {
  return "OB" + Math.floor(100000 + Math.random() * 900000);
}

// Order items are a frozen snapshot of the product at purchase time, so
// later price/name edits never rewrite order history.
const orderItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    slug: String,
    name: String,
    brand: String,
    category: String,
    type: { type: String, default: null },
    description: String,
    sizes: { type: [String], default: [] },
    price: Number,
    oldPrice: { type: Number, default: null },
    rating: Number,
    image: { type: String, default: null },
    images: { type: [String], default: [] },
    size: { type: String, default: null },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false, strict: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    phone: { type: String, required: true },
    email: String,
    address: { type: String, required: true },
    apartment: String,
    city: { type: String, required: true },
    state: String,
    country: { type: String, default: "India" },
    pincode: { type: String, required: true },
  },
  { _id: false }
);

const cancellationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [null, "requested", "approved", "rejected"],
      default: null,
    },
    reason: { type: String, default: null },
    requestedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: String, default: null },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    _id: { type: String, default: generateOrderId },
    userId: { type: String, ref: "User", required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    couponCode: { type: String, default: null },
    paymentMethod: {
      type: String,
      enum: ["cod", "card", "upi", "netbanking"],
      required: true,
    },
    paymentIntentId: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Refunded", "Failed"],
      default: "Pending",
    },
    shippingAddress: { type: shippingAddressSchema, required: true },
    status: {
      type: String,
      enum: ["Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"],
      default: "Confirmed",
      index: true,
    },
    cancellation: { type: cancellationSchema, default: () => ({}) },
  },
  { ...baseOptions, _id: false }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ "cancellation.status": 1 });

module.exports = mongoose.model("Order", orderSchema);
module.exports.generateOrderId = generateOrderId;
