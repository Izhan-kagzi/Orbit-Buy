const { readDB, writeDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

// Cart entries only ever store { productId, quantity }. Prices are
// always looked up fresh from the product catalog when returning the
// cart, so a client can never manipulate what it actually gets charged.
function buildCartResponse(db, userId) {
  const rawCart = db.carts[userId] || [];

  const items = rawCart
    .map((entry) => {
      const product = db.products.find((p) => p.id === entry.productId);
      if (!product) return null;

      return {
        ...product,
        quantity: entry.quantity,
        lineTotal: Number((product.price * entry.quantity).toFixed(2)),
      };
    })
    .filter(Boolean);

  const subtotal = Number(
    items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
  );

  return { items, subtotal, count: items.reduce((n, i) => n + i.quantity, 0) };
}

// @route GET /api/cart
const getCart = asyncHandler(async (req, res) => {
  const db = readDB();
  res.json({ success: true, cart: buildCartResponse(db, req.user.id) });
});

// @route POST /api/cart  { productId, quantity }
const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  if (!productId) {
    throw new ApiError(400, "productId is required.");
  }

  const qty = Math.max(1, Number(quantity) || 1);

  const db = readDB();
  const product = db.products.find((p) => p.id === productId);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  if (!db.carts[req.user.id]) db.carts[req.user.id] = [];

  const cart = db.carts[req.user.id];
  const existing = cart.find((entry) => entry.productId === productId);

  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({ productId, quantity: qty });
  }

  writeDB(db);

  res.status(201).json({ success: true, cart: buildCartResponse(db, req.user.id) });
});

// @route PUT /api/cart/:productId  { quantity }
const updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const { productId } = req.params;

  if (!quantity || Number(quantity) < 1) {
    throw new ApiError(400, "quantity must be at least 1.");
  }

  const db = readDB();
  const cart = db.carts[req.user.id] || [];
  const entry = cart.find((e) => e.productId === productId);

  if (!entry) {
    throw new ApiError(404, "Item not in cart.");
  }

  entry.quantity = Number(quantity);
  writeDB(db);

  res.json({ success: true, cart: buildCartResponse(db, req.user.id) });
});

// @route DELETE /api/cart/:productId
const removeFromCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const db = readDB();
  db.carts[req.user.id] = (db.carts[req.user.id] || []).filter(
    (e) => e.productId !== productId
  );
  writeDB(db);

  res.json({ success: true, cart: buildCartResponse(db, req.user.id) });
});

// @route DELETE /api/cart
const clearCart = asyncHandler(async (req, res) => {
  const db = readDB();
  db.carts[req.user.id] = [];
  writeDB(db);

  res.json({ success: true, cart: buildCartResponse(db, req.user.id) });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  buildCartResponse,
};
