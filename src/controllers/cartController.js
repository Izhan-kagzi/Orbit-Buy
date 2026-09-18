const Cart = require("../models/Cart");
const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Cart entries only ever store { productId, quantity }. Prices are
 * always looked up fresh from the product catalog when returning the
 * cart, so a client can never manipulate what it actually gets charged.
 */
async function buildCartResponse(userId) {
  const cart = await Cart.findOne({ user: userId }).lean();
  const rawItems = cart?.items || [];

  if (rawItems.length === 0) {
    return { items: [], subtotal: 0, count: 0 };
  }

  const products = await Product.find({
    _id: { $in: rawItems.map((entry) => entry.productId) },
  });

  const productMap = new Map(
    products.map((product) => [String(product._id), product.toJSON()])
  );

  const items = rawItems
    .map((entry) => {
      const product = productMap.get(String(entry.productId));
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

  return {
    items,
    subtotal,
    count: items.reduce((n, item) => n + item.quantity, 0),
  };
}

/** Returns the user's cart document, creating it on first use. */
async function getOrCreateCart(userId) {
  const existing = await Cart.findOne({ user: userId });
  if (existing) return existing;

  return Cart.create({ user: userId, items: [] });
}

// @route GET /api/cart
const getCart = asyncHandler(async (req, res) => {
  res.json({ success: true, cart: await buildCartResponse(req.user.id) });
});

// @route POST /api/cart  { productId, quantity }
const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  if (!productId) {
    throw new ApiError(400, "productId is required.");
  }

  const qty = Math.max(1, Number(quantity) || 1);

  const product = await Product.findById(productId);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const cart = await getOrCreateCart(req.user.id);
  const existing = cart.items.find(
    (entry) => String(entry.productId) === String(productId)
  );

  const requestedTotal = (existing ? existing.quantity : 0) + qty;

  if (product.stock < requestedTotal) {
    throw new ApiError(
      409,
      `Only ${product.stock} left in stock for "${product.name}".`
    );
  }

  if (existing) {
    existing.quantity = requestedTotal;
  } else {
    cart.items.push({ productId: String(productId), quantity: qty });
  }

  await cart.save();

  res
    .status(201)
    .json({ success: true, cart: await buildCartResponse(req.user.id) });
});

// @route PUT /api/cart/:productId  { quantity }
const updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const { productId } = req.params;

  const qty = Number(quantity);

  if (!Number.isFinite(qty) || qty < 1) {
    throw new ApiError(400, "quantity must be at least 1.");
  }

  const cart = await Cart.findOne({ user: req.user.id });
  const entry = cart?.items.find(
    (item) => String(item.productId) === String(productId)
  );

  if (!entry) {
    throw new ApiError(404, "Item not in cart.");
  }

  const product = await Product.findById(productId);

  if (product && product.stock < qty) {
    throw new ApiError(
      409,
      `Only ${product.stock} left in stock for "${product.name}".`
    );
  }

  entry.quantity = qty;
  await cart.save();

  res.json({ success: true, cart: await buildCartResponse(req.user.id) });
});

// @route DELETE /api/cart/:productId
const removeFromCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  await Cart.updateOne(
    { user: req.user.id },
    { $pull: { items: { productId: String(productId) } } }
  );

  res.json({ success: true, cart: await buildCartResponse(req.user.id) });
});

// @route DELETE /api/cart
const clearCart = asyncHandler(async (req, res) => {
  await Cart.updateOne(
    { user: req.user.id },
    { $set: { items: [] } },
    { upsert: true }
  );

  res.json({ success: true, cart: await buildCartResponse(req.user.id) });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  buildCartResponse,
  getOrCreateCart,
};
