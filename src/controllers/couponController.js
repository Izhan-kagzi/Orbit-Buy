const crypto = require("crypto");
const { readDB, writeDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

// Given a coupon record and an order subtotal, returns the discount
// amount in rupees — 0 if the coupon doesn't apply right now.
function computeDiscount(coupon, subtotal) {
  if (!coupon || !coupon.active) return 0;

  const now = new Date();
  if (coupon.startDate && now < new Date(coupon.startDate)) return 0;
  if (coupon.endDate && now > new Date(coupon.endDate)) return 0;

  if (coupon.discountType === "percent") {
    const raw = (subtotal * coupon.discountValue) / 100;
    return coupon.maxDiscount
      ? Math.min(raw, coupon.maxDiscount)
      : raw;
  }

  // flat
  return Math.min(coupon.discountValue, subtotal);
}

function findActiveCoupon(db, code) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return (
    db.coupons.find((c) => c.code.toUpperCase() === normalized) || null
  );
}

function couponStatus(coupon) {
  const now = new Date();
  if (!coupon.active) return "inactive";
  if (coupon.startDate && now < new Date(coupon.startDate)) return "upcoming";
  if (coupon.endDate && now > new Date(coupon.endDate)) return "expired";
  return "active";
}

// @route POST /api/coupons/apply  { code, subtotal }  (customer, logged in)
const applyCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body;

  if (!code || !code.trim()) {
    throw new ApiError(400, "Please enter a coupon code.");
  }

  const db = readDB();
  const coupon = findActiveCoupon(db, code);

  if (!coupon) {
    throw new ApiError(400, "Invalid coupon code.");
  }

  const status = couponStatus(coupon);

  if (status === "expired") {
    throw new ApiError(400, "This coupon has expired.");
  }
  if (status === "upcoming") {
    throw new ApiError(
      400,
      `This coupon isn't active yet — it starts ${new Date(
        coupon.startDate
      ).toLocaleDateString()}.`
    );
  }
  if (status === "inactive") {
    throw new ApiError(400, "This coupon is no longer available.");
  }

  const discount = computeDiscount(coupon, Number(subtotal) || 0);

  res.json({
    success: true,
    code: coupon.code,
    discount: Number(discount.toFixed(2)),
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
  });
});

// @route GET /api/coupons  (admin only) — full list with computed status
const getCoupons = asyncHandler(async (req, res) => {
  const db = readDB();
  const coupons = db.coupons.map((c) => ({
    ...c,
    status: couponStatus(c),
  }));

  res.json({ success: true, count: coupons.length, coupons });
});

// @route POST /api/coupons  (admin only)
const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    discountType,
    discountValue,
    startDate,
    endDate,
    active,
    maxDiscount,
  } = req.body;

  if (!code || !discountValue || !startDate || !endDate) {
    throw new ApiError(
      400,
      "code, discountValue, startDate and endDate are required."
    );
  }

  if (!["flat", "percent"].includes(discountType)) {
    throw new ApiError(400, 'discountType must be "flat" or "percent".');
  }

  if (new Date(startDate) >= new Date(endDate)) {
    throw new ApiError(400, "endDate must be after startDate.");
  }

  const db = readDB();

  const normalized = code.trim().toUpperCase();
  if (db.coupons.some((c) => c.code.toUpperCase() === normalized)) {
    throw new ApiError(409, `A coupon with code "${normalized}" already exists.`);
  }

  const newCoupon = {
    id: `coupon-${crypto.randomUUID().slice(0, 8)}`,
    code: normalized,
    discountType,
    discountValue: Number(discountValue),
    maxDiscount: maxDiscount ? Number(maxDiscount) : null,
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    active: active === undefined ? true : Boolean(active),
    createdAt: new Date().toISOString(),
  };

  db.coupons.unshift(newCoupon);
  writeDB(db);

  res.status(201).json({ success: true, coupon: newCoupon });
});

// @route PUT /api/coupons/:id  (admin only)
const updateCoupon = asyncHandler(async (req, res) => {
  const db = readDB();
  const coupon = db.coupons.find((c) => c.id === req.params.id);

  if (!coupon) {
    throw new ApiError(404, "Coupon not found.");
  }

  const {
    code,
    discountType,
    discountValue,
    startDate,
    endDate,
    active,
    maxDiscount,
  } = req.body;

  if (code) coupon.code = code.trim().toUpperCase();
  if (discountType) {
    if (!["flat", "percent"].includes(discountType)) {
      throw new ApiError(400, 'discountType must be "flat" or "percent".');
    }
    coupon.discountType = discountType;
  }
  if (discountValue !== undefined) coupon.discountValue = Number(discountValue);
  if (maxDiscount !== undefined) {
    coupon.maxDiscount = maxDiscount ? Number(maxDiscount) : null;
  }
  if (startDate) coupon.startDate = new Date(startDate).toISOString();
  if (endDate) coupon.endDate = new Date(endDate).toISOString();
  if (active !== undefined) coupon.active = Boolean(active);

  if (new Date(coupon.startDate) >= new Date(coupon.endDate)) {
    throw new ApiError(400, "endDate must be after startDate.");
  }

  writeDB(db);

  res.json({ success: true, coupon });
});

// @route DELETE /api/coupons/:id  (admin only)
const deleteCoupon = asyncHandler(async (req, res) => {
  const db = readDB();
  const exists = db.coupons.some((c) => c.id === req.params.id);

  if (!exists) {
    throw new ApiError(404, "Coupon not found.");
  }

  db.coupons = db.coupons.filter((c) => c.id !== req.params.id);
  writeDB(db);

  res.json({ success: true, message: "Coupon deleted." });
});

module.exports = {
  applyCoupon,
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  computeDiscount,
  findActiveCoupon,
  couponStatus,
};
