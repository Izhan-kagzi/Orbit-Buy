const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const Cart = require("../models/Cart");
const { buildCartResponse } = require("./cartController");
const {
  findActiveCoupon,
  computeDiscount,
  couponStatus,
} = require("./couponController");
const { calculateTotals } = require("../utils/pricing");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const PAYMENT_METHODS = ["cod", "card", "upi", "netbanking"];
const ORDER_STATUSES = [
  "Confirmed",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
];

// @route POST /api/orders
// { paymentMethod, couponCode, shippingAddress, paymentIntentId }
const placeOrder = asyncHandler(async (req, res) => {
  const { paymentMethod, couponCode, shippingAddress, paymentIntentId } =
    req.body;

  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod)) {
    throw new ApiError(400, "A valid payment method is required.");
  }

  if (
    !shippingAddress ||
    !shippingAddress.address ||
    !shippingAddress.city ||
    !shippingAddress.pincode ||
    !shippingAddress.phone
  ) {
    throw new ApiError(
      400,
      "A complete shipping address (address, city, pincode, phone) is required."
    );
  }

  const { items, subtotal } = await buildCartResponse(req.user.id);

  if (items.length === 0) {
    throw new ApiError(400, "Your cart is empty.");
  }

  // Re-validate stock server-side — never trust the client's cart snapshot.
  const products = await Product.find({
    _id: { $in: items.map((item) => item.id) },
  });

  const productMap = new Map(products.map((p) => [String(p._id), p]));

  for (const item of items) {
    const product = productMap.get(String(item.id));
    if (!product || product.stock < item.quantity) {
      throw new ApiError(
        409,
        `"${item.name}" doesn't have enough stock left (available: ${
          product ? product.stock : 0
        }).`
      );
    }
  }

  let discount = 0;
  let appliedCode = null;

  if (couponCode) {
    const coupon = await findActiveCoupon(couponCode);
    const status = coupon ? couponStatus(coupon) : null;

    if (!coupon || status !== "active") {
      throw new ApiError(400, "This coupon can't be applied right now.");
    }

    discount = computeDiscount(coupon, subtotal);
    appliedCode = coupon.code;
  }

  const { shipping, tax, total } = calculateTotals(subtotal, discount);

  // Card payments: never trust a client-reported "payment succeeded".
  // Look the PaymentIntent up on Stripe's servers directly and confirm
  // it actually succeeded, belongs to this user, and was charged the
  // exact amount this order computes to — before an order is created.
  if (paymentMethod === "card") {
    if (!paymentIntentId) {
      throw new ApiError(400, "Missing payment confirmation for card payment.");
    }

    const { getStripe } = require("./paymentController");
    const stripe = getStripe();

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status !== "succeeded") {
      throw new ApiError(402, "Payment has not been completed successfully.");
    }

    if (intent.metadata?.userId !== req.user.id) {
      throw new ApiError(403, "This payment doesn't belong to your account.");
    }

    const expectedAmount = Math.round(total * 100);
    if (intent.amount !== expectedAmount) {
      throw new ApiError(
        402,
        "The paid amount doesn't match this order's total. Please contact support."
      );
    }

    // Reject a PaymentIntent that has already been used for an order.
    const reused = await Order.exists({ paymentIntentId });
    if (reused) {
      throw new ApiError(409, "This payment has already been used for an order.");
    }
  }

  // Decrement stock now that the order is confirmed.
  await Promise.all(
    items.map((item) =>
      Product.updateOne({ _id: item.id }, { $inc: { stock: -item.quantity } })
    )
  );

  const order = await Order.create({
    userId: req.user.id,
    items,
    subtotal,
    shipping,
    tax,
    discount,
    total,
    couponCode: appliedCode,
    paymentMethod,
    paymentIntentId: paymentMethod === "card" ? paymentIntentId : null,
    paymentStatus: paymentMethod === "card" ? "Paid" : "Pending",
    shippingAddress,
    status: "Confirmed",
    cancellation: {
      status: null,
      reason: null,
      requestedAt: null,
      resolvedAt: null,
      resolvedBy: null,
    },
  });

  await Cart.updateOne({ user: req.user.id }, { $set: { items: [] } });

  res.status(201).json({ success: true, order: order.toJSON() });
});

// @route GET /api/orders
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.user.id }).sort({
    createdAt: -1,
  });

  res.json({
    success: true,
    count: orders.length,
    orders: orders.map((o) => o.toJSON()),
  });
});

// @route GET /api/orders/:id
const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  const isStaff = ["admin", "manager"].includes(req.user.role);

  if (String(order.userId) !== req.user.id && !isStaff) {
    throw new ApiError(404, "Order not found.");
  }

  res.json({ success: true, order: order.toJSON() });
});

// @route GET /api/orders/admin/all  (staff)
const getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });

  const users = await User.find({
    _id: { $in: [...new Set(orders.map((o) => o.userId))] },
  }).lean();

  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const result = orders.map((order) => {
    const user = userMap.get(String(order.userId));
    return {
      ...order.toJSON(),
      customer: user
        ? { name: user.name, email: user.email, mobile: user.mobile }
        : null,
    };
  });

  res.json({ success: true, count: result.length, orders: result });
});

// @route PUT /api/orders/:id/status  (staff)  { status }
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!ORDER_STATUSES.includes(status)) {
    throw new ApiError(
      400,
      `status must be one of: ${ORDER_STATUSES.join(", ")}`
    );
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  if (order.status === "Cancelled" && status !== "Cancelled") {
    throw new ApiError(400, "A cancelled order can't be reopened.");
  }

  // Cancelling from the admin panel restocks the items too.
  if (status === "Cancelled" && order.status !== "Cancelled") {
    await Promise.all(
      order.items.map((item) =>
        Product.updateOne({ _id: item.id }, { $inc: { stock: item.quantity } })
      )
    );
  }

  order.status = status;

  if (status === "Delivered" && order.paymentMethod === "cod") {
    order.paymentStatus = "Paid";
  }

  await order.save();

  res.json({ success: true, order: order.toJSON() });
});

// @route GET /api/orders/admin/stats  (staff)
const getStats = asyncHandler(async (req, res) => {
  const [
    totalProducts,
    totalOrders,
    totalUsers,
    revenueAgg,
    lowStockProducts,
    outOfStockProducts,
    pendingCancellations,
  ] = await Promise.all([
    Product.countDocuments(),
    Order.countDocuments(),
    User.countDocuments(),
    // Cancelled orders never count towards revenue.
    Order.aggregate([
      { $match: { status: { $ne: "Cancelled" } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
    Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
    Product.countDocuments({ stock: { $lte: 0 } }),
    Order.countDocuments({ "cancellation.status": "requested" }),
  ]);

  const totalRevenue = revenueAgg[0]?.total || 0;

  res.json({
    success: true,
    stats: {
      totalProducts,
      totalOrders,
      totalUsers,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      lowStockProducts,
      outOfStockProducts,
      pendingCancellations,
    },
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// @route GET /api/orders/admin/sales?period=weekly|monthly|yearly  (staff)
const getSalesStats = asyncHandler(async (req, res) => {
  const period = req.query.period || "weekly";
  const now = new Date();

  const buckets = [];

  if (period === "weekly") {
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * DAY_MS);
      buckets.push({
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate()),
        end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1),
      });
    }
  } else if (period === "monthly") {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let weekStart = 1;
    let weekNum = 1;
    while (weekStart <= daysInMonth) {
      const weekEndDay = Math.min(weekStart + 6, daysInMonth);
      buckets.push({
        label: `Week ${weekNum}`,
        start: new Date(year, month, weekStart),
        end: new Date(year, month, weekEndDay + 1),
      });
      weekStart += 7;
      weekNum += 1;
    }
  } else if (period === "yearly") {
    const year = now.getFullYear();
    for (let m = 0; m < 12; m++) {
      buckets.push({
        label: MONTH_NAMES[m],
        start: new Date(year, m, 1),
        end: new Date(year, m + 1, 1),
      });
    }
  } else {
    throw new ApiError(400, "period must be weekly, monthly, or yearly.");
  }

  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;

  const orders = await Order.find({
    status: { $ne: "Cancelled" },
    createdAt: { $gte: rangeStart, $lt: rangeEnd },
  })
    .select("total createdAt")
    .lean();

  const data = buckets.map(({ label, start, end }) => {
    const ordersInBucket = orders.filter((o) => {
      const created = new Date(o.createdAt);
      return created >= start && created < end;
    });

    return {
      label,
      sales: Number(
        ordersInBucket.reduce((sum, o) => sum + (o.total || 0), 0).toFixed(2)
      ),
      orders: ordersInBucket.length,
    };
  });

  const totalSales = Number(
    data.reduce((sum, d) => sum + d.sales, 0).toFixed(2)
  );
  const totalOrders = data.reduce((sum, d) => sum + d.orders, 0);

  // Percentage change vs the previous equivalent period.
  let prevStart;
  let prevEnd;

  if (period === "weekly") {
    prevStart = new Date(rangeStart.getTime() - 7 * DAY_MS);
    prevEnd = rangeStart;
  } else if (period === "monthly") {
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    prevStart = new Date(year, month, 1);
    prevEnd = new Date(year, month + 1, 1);
  } else {
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear(), 0, 1);
  }

  const [prevAgg] = await Order.aggregate([
    {
      $match: {
        status: { $ne: "Cancelled" },
        createdAt: { $gte: prevStart, $lt: prevEnd },
      },
    },
    { $group: { _id: null, total: { $sum: "$total" } } },
  ]);

  const previousTotal = prevAgg?.total || 0;

  const changePercent =
    previousTotal > 0
      ? Number((((totalSales - previousTotal) / previousTotal) * 100).toFixed(1))
      : totalSales > 0
      ? 100
      : 0;

  res.json({
    success: true,
    period,
    data,
    totalSales,
    totalOrders,
    changePercent,
  });
});

// @route POST /api/orders/:id/request-cancellation  { reason }
// The customer applies for cancellation — this does NOT cancel the
// order by itself. It only flags it for a manager or admin to review.
const requestCancellation = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const order = await Order.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  if (order.status === "Cancelled") {
    throw new ApiError(400, "This order is already cancelled.");
  }

  if (order.status === "Delivered") {
    throw new ApiError(
      400,
      "This order has already been delivered and can't be cancelled."
    );
  }

  if (order.cancellation?.status === "requested") {
    throw new ApiError(
      400,
      "A cancellation request is already pending for this order."
    );
  }

  order.cancellation = {
    status: "requested",
    reason: reason || "",
    requestedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  };

  await order.save();

  res.json({ success: true, order: order.toJSON() });
});

// @route GET /api/orders/admin/cancellations  (staff)
const getCancellationRequests = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    "cancellation.status": "requested",
  }).sort({ "cancellation.requestedAt": -1 });

  const users = await User.find({
    _id: { $in: [...new Set(orders.map((o) => o.userId))] },
  }).lean();

  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const result = orders.map((order) => {
    const user = userMap.get(String(order.userId));
    return {
      ...order.toJSON(),
      customer: user
        ? { name: user.name, email: user.email, mobile: user.mobile }
        : null,
    };
  });

  res.json({ success: true, count: result.length, orders: result });
});

// @route PUT /api/orders/:id/cancellation  (staff)  { action: "approve" | "reject" }
const resolveCancellation = asyncHandler(async (req, res) => {
  const { action } = req.body;

  if (!["approve", "reject"].includes(action)) {
    throw new ApiError(400, 'action must be "approve" or "reject".');
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  if (order.cancellation?.status !== "requested") {
    throw new ApiError(400, "This order has no pending cancellation request.");
  }

  if (action === "approve") {
    // Restock the cancelled items.
    await Promise.all(
      order.items.map((item) =>
        Product.updateOne({ _id: item.id }, { $inc: { stock: item.quantity } })
      )
    );

    order.status = "Cancelled";
    order.cancellation.status = "approved";

    if (order.paymentStatus === "Paid") {
      order.paymentStatus = "Refunded";
    }
  } else {
    order.cancellation.status = "rejected";
  }

  order.cancellation.resolvedAt = new Date();
  order.cancellation.resolvedBy = req.user.name;

  await order.save();

  res.json({ success: true, order: order.toJSON() });
});

module.exports = {
  placeOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  getStats,
  getSalesStats,
  requestCancellation,
  getCancellationRequests,
  resolveCancellation,
};
