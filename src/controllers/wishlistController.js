const { readDB, writeDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

function buildWishlistResponse(db, userId) {
  const ids = db.wishlists[userId] || [];
  return db.products.filter((p) => ids.includes(p.id));
}

// @route GET /api/wishlist
const getWishlist = asyncHandler(async (req, res) => {
  const db = readDB();
  res.json({ success: true, wishlist: buildWishlistResponse(db, req.user.id) });
});

// @route POST /api/wishlist  { productId }
const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    throw new ApiError(400, "productId is required.");
  }

  const db = readDB();
  const product = db.products.find((p) => p.id === productId);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  if (!db.wishlists[req.user.id]) db.wishlists[req.user.id] = [];

  if (!db.wishlists[req.user.id].includes(productId)) {
    db.wishlists[req.user.id].push(productId);
    writeDB(db);
  }

  res
    .status(201)
    .json({ success: true, wishlist: buildWishlistResponse(db, req.user.id) });
});

// @route DELETE /api/wishlist/:productId
const removeFromWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const db = readDB();
  db.wishlists[req.user.id] = (db.wishlists[req.user.id] || []).filter(
    (id) => id !== productId
  );
  writeDB(db);

  res.json({ success: true, wishlist: buildWishlistResponse(db, req.user.id) });
});

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
