const crypto = require("crypto");

const { readDB, writeDB } = require("../config/db");
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

function generateOrderId() {
  return "OB" + Math.floor(100000 + Math.random() * 900000);
}

// @route POST /api/orders  { paymentMethod, couponCode, shippingAddress, paymentIntentId }
const placeOrder = asyncHandler(async (req, res) => {
  const { paymentMethod, couponCode, shippingAddress, paymentIntentId } = req.body;

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

  const db = readDB();
  const { items, subtotal } = buildCartResponse(db, req.user.id);

  if (items.length === 0) {
    throw new ApiError(400, "Your cart is empty.");
  }

  // Re-validate stock server-side — never trust the client's cart snapshot.
  for (const item of items) {
    const product = db.products.find((p) => p.id === item.id);
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
  if (couponCode) {
    const coupon = findActiveCoupon(db, couponCode);
    const status = coupon ? couponStatus(coupon) : null;

    if (!coupon || status !== "active") {
      throw new ApiError(400, "This coupon can't be applied right now.");
    }

    discount = computeDiscount(coupon, subtotal);
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
  }

  // Decrement stock now that the order is confirmed.
  items.forEach((item) => {
    const product = db.products.find((p) => p.id === item.id);
    if (product) product.stock -= item.quantity;
  });

  const order = {
    id: generateOrderId(),
    userId: req.user.id,
    items,
    subtotal,
    shipping,
    tax,
    discount,
    total,
    paymentMethod,
    paymentIntentId: paymentMethod === "card" ? paymentIntentId : null,
    paymentStatus: paymentMethod === "card" ? "Paid" : "Pending",
    shippingAddress,
    status: "Confirmed",
    cancellation: {
      status: null, // null | "requested" | "approved" | "rejected"
      reason: null,
      requestedAt: null,
      resolvedAt: null,
      resolvedBy: null,
    },
    createdAt: new Date().toISOString(),
  };

  db.orders.unshift(order);
  db.carts[req.user.id] = [];
  writeDB(db);

  res.status(201).json({ success: true, order });
});

// @route GET /api/orders
const getMyOrders = asyncHandler(async (req, res) => {
  const db = readDB();
  const orders = db.orders.filter((o) => o.userId === req.user.id);
  res.json({ success: true, count: orders.length, orders });
});

// @route GET /api/orders/:id
const getOrderById = asyncHandler(async (req, res) => {
  const db = readDB();
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.userId === req.user.id
  );

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  res.json({ success: true, order });
});

// @route GET /api/orders/admin/all  (admin only)
const getAllOrders = asyncHandler(async (req, res) => {
  const db = readDB();

  const orders = db.orders.map((order) => {
    const user = db.users.find((u) => u.id === order.userId);
    return {
      ...order,
      customer: user
        ? { name: user.name, email: user.email, mobile: user.mobile }
        : null,
    };
  });

  res.json({ success: true, count: orders.length, orders });
});

// @route GET /api/orders/admin/stats  (admin only)
const getStats = asyncHandler(async (req, res) => {
  const db = readDB();

  const totalRevenue = db.orders.reduce(
    (sum, order) => sum + (order.total || 0),
    0
  );

  res.json({
    success: true,
    stats: {
      totalProducts: db.products.length,
      totalOrders: db.orders.length,
      totalUsers: db.users.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      lowStockProducts: db.products.filter(
        (p) => p.stock > 0 && p.stock <= 5
      ).length,
      outOfStockProducts: db.products.filter((p) => p.stock <= 0).length,
    },
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// @route GET /api/orders/admin/sales?period=weekly|monthly|yearly  (admin only)
const getSalesStats = asyncHandler(async (req, res) => {
  const db = readDB();
  const period = req.query.period || "weekly";
  const now = new Date();

  let buckets = [];

  if (period === "weekly") {
    // Last 7 days, one bucket per day.
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * DAY_MS);
      buckets.push({
        label: day.toLocaleDateString("en-US", { weekday: "short" }),
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate()),
        end: new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate() + 1
        ),
      });
    }
  } else if (period === "monthly") {
    // Current month, one bucket per week (up to 5).
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
    // Current year, one bucket per month.
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

  const data = buckets.map(({ label, start, end }) => {
    const ordersInBucket = db.orders.filter((o) => {
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

  // Percentage change vs the previous equivalent period, for the
  // "+40% vs last week" style indicator.
  let previousTotal = 0;
  if (period === "weekly") {
    const prevStart = new Date(now.getTime() - 13 * DAY_MS);
    const prevEnd = new Date(now.getTime() - 6 * DAY_MS);
    previousTotal = db.orders
      .filter((o) => {
        const created = new Date(o.createdAt);
        return created >= prevStart && created < prevEnd;
      })
      .reduce((sum, o) => sum + (o.total || 0), 0);
  } else if (period === "monthly") {
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevStart = new Date(year, month, 1);
    const prevEnd = new Date(year, month + 1, 1);
    previousTotal = db.orders
      .filter((o) => {
        const created = new Date(o.createdAt);
        return created >= prevStart && created < prevEnd;
      })
      .reduce((sum, o) => sum + (o.total || 0), 0);
  } else {
    const prevStart = new Date(now.getFullYear() - 1, 0, 1);
    const prevEnd = new Date(now.getFullYear(), 0, 1);
    previousTotal = db.orders
      .filter((o) => {
        const created = new Date(o.createdAt);
        return created >= prevStart && created < prevEnd;
      })
      .reduce((sum, o) => sum + (o.total || 0), 0);
  }

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
// order by itself. It only flags it for a manager or admin to review
// and approve/reject.
const requestCancellation = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const db = readDB();
  const order = db.orders.find(
    (o) => o.id === req.params.id && o.userId === req.user.id
  );

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  if (order.status === "Cancelled") {
    throw new ApiError(400, "This order is already cancelled.");
  }

  if (order.cancellation?.status === "requested") {
    throw new ApiError(400, "A cancellation request is already pending for this order.");
  }

  order.cancellation = {
    status: "requested",
    reason: reason || "",
    requestedAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
  };

  writeDB(db);

  res.json({ success: true, order });
});

// @route GET /api/orders/admin/cancellations  (staff: admin or manager)
const getCancellationRequests = asyncHandler(async (req, res) => {
  const db = readDB();

  const requests = db.orders
    .filter((o) => o.cancellation?.status === "requested")
    .map((order) => {
      const user = db.users.find((u) => u.id === order.userId);
      return {
        ...order,
        customer: user
          ? { name: user.name, email: user.email, mobile: user.mobile }
          : null,
      };
    });

  res.json({ success: true, count: requests.length, orders: requests });
});

// @route PUT /api/orders/:id/cancellation  (staff: admin or manager)  { action: "approve" | "reject" }
const resolveCancellation = asyncHandler(async (req, res) => {
  const { action } = req.body;

  if (!["approve", "reject"].includes(action)) {
    throw new ApiError(400, 'action must be "approve" or "reject".');
  }

  const db = readDB();
  const order = db.orders.find((o) => o.id === req.params.id);

  if (!order) {
    throw new ApiError(404, "Order not found.");
  }

  if (order.cancellation?.status !== "requested") {
    throw new ApiError(400, "This order has no pending cancellation request.");
  }

  if (action === "approve") {
    // Restock the cancelled items.
    order.items.forEach((item) => {
      const product = db.products.find((p) => p.id === item.id);
      if (product) product.stock += item.quantity;
    });

    order.status = "Cancelled";
    order.cancellation.status = "approved";
  } else {
    order.cancellation.status = "rejected";
  }

  order.cancellation.resolvedAt = new Date().toISOString();
  order.cancellation.resolvedBy = req.user.name;

  writeDB(db);

  res.json({ success: true, order });
});

module.exports = {
  placeOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  getStats,
  getSalesStats,
  requestCancellation,
  getCancellationRequests,
  resolveCancellation,
};
