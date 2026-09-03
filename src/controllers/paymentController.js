const { readDB } = require("../config/db");
const { buildCartResponse } = require("./cartController");
const { findActiveCoupon, computeDiscount, couponStatus } = require("./couponController");
const { calculateTotals } = require("../utils/pricing");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

let stripeClient = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new ApiError(
      503,
      "Card payments aren't configured yet. Add STRIPE_SECRET_KEY to backend/.env to enable them (use a Stripe TEST mode key)."
    );
  }
  if (!stripeClient) {
    stripeClient = require("stripe")(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

// @route POST /api/payments/create-intent  { couponCode? }
// Creates a Stripe PaymentIntent for the user's CURRENT cart total,
// computed entirely server-side from real product prices — the
// client can request a coupon be applied, but never states an amount.
const createPaymentIntent = asyncHandler(async (req, res) => {
  const stripe = getStripe();
  const { couponCode } = req.body;

  const db = readDB();
  const { items, subtotal } = buildCartResponse(db, req.user.id);

  if (items.length === 0) {
    throw new ApiError(400, "Your cart is empty.");
  }

  let discount = 0;
  if (couponCode) {
    const coupon = findActiveCoupon(db, couponCode);
    if (coupon && couponStatus(coupon) === "active") {
      discount = computeDiscount(coupon, subtotal);
    }
  }

  const { shipping, tax, total } = calculateTotals(subtotal, discount);

  // Stripe expects the smallest currency unit — paise for INR.
  const amountInPaise = Math.round(total * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPaise,
    currency: "inr",
    automatic_payment_methods: { enabled: true },
    metadata: {
      userId: req.user.id,
      couponCode: couponCode || "",
    },
  });

  res.json({
    success: true,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: total,
    breakdown: { subtotal, shipping, tax, discount, total },
  });
});

// @route GET /api/payments/config
// Tells the frontend whether Stripe is configured, without
// exposing the secret key.
const getPaymentConfig = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  });
});

module.exports = { createPaymentIntent, getPaymentConfig, getStripe };
