const Coupon = require("../models/Coupon");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Given a coupon document and an order subtotal, returns the discount
 * amount in rupees — 0 if the coupon doesn't apply right now.
 */
function computeDiscount(coupon, subtotal) {
  if (!coupon || !coupon.active) return 0;

  const now = new Date();
  if (coupon.startDate && now < new Date(coupon.startDate)) return 0;
  if (coupon.endDate && now > new Date(coupon.endDate)) return 0;

  if (coupon.discountType === "percent") {
    const raw = (subtotal * coupon.discountValue) / 100;
    return coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
  }

  // flat
  return Math.min(coupon.discountValue, subtotal);
}

async function findActiveCoupon(code) {
  if (!code) return null;
  return Coupon.findOne({ code: String(code).trim().toUpperCase() });
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

  if (!code || !String(code).trim()) {
    throw new ApiError(400, "Please enter a coupon code.");
  }

  const coupon = await findActiveCoupon(code);

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
  const coupons = await Coupon.find().sort({ createdAt: -1 });

  const result = coupons.map((coupon) => ({
    ...coupon.toJSON(),
    status: couponStatus(coupon),
  }));

  res.json({ success: true, count: result.length, coupons: result });
});

// @route POST /api/coupons  (admin only)
const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    discountType = "flat",
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

  const normalized = String(code).trim().toUpperCase();

  const existing = await Coupon.findOne({ code: normalized }).lean();
  if (existing) {
    throw new ApiError(
      409,
      `A coupon with code "${normalized}" already exists.`
    );
  }

  const coupon = await Coupon.create({
    code: normalized,
    discountType,
    discountValue: Number(discountValue),
    maxDiscount: maxDiscount ? Number(maxDiscount) : null,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    active: active === undefined ? true : Boolean(active),
  });

  res.status(201).json({
    success: true,
    coupon: { ...coupon.toJSON(), status: couponStatus(coupon) },
  });
});

// @route PUT /api/coupons/:id  (admin only)
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

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

  if (code) coupon.code = String(code).trim().toUpperCase();

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

  if (startDate) coupon.startDate = new Date(startDate);
  if (endDate) coupon.endDate = new Date(endDate);
  if (active !== undefined) coupon.active = Boolean(active);

  if (new Date(coupon.startDate) >= new Date(coupon.endDate)) {
    throw new ApiError(400, "endDate must be after startDate.");
  }

  await coupon.save();

  res.json({
    success: true,
    coupon: { ...coupon.toJSON(), status: couponStatus(coupon) },
  });
});

// @route DELETE /api/coupons/:id  (admin only)
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    throw new ApiError(404, "Coupon not found.");
  }

  await Coupon.deleteOne({ _id: coupon._id });

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
