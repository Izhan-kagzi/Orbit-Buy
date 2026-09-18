const Wishlist = require("../models/Wishlist");
const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

async function buildWishlistResponse(userId) {
  const wishlist = await Wishlist.findOne({ user: userId }).lean();
  const ids = wishlist?.products || [];

  if (ids.length === 0) return [];

  const products = await Product.find({ _id: { $in: ids } });

  // Preserve the order the customer added them in.
  const byId = new Map(products.map((p) => [String(p._id), p.toJSON()]));

  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

// @route GET /api/wishlist
const getWishlist = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    wishlist: await buildWishlistResponse(req.user.id),
  });
});

// @route POST /api/wishlist  { productId }
const addToWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;

  if (!productId) {
    throw new ApiError(400, "productId is required.");
  }

  const product = await Product.findById(productId).lean();

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  // $addToSet keeps it idempotent — adding twice is harmless.
  await Wishlist.updateOne(
    { user: req.user.id },
    { $addToSet: { products: String(productId) } },
    { upsert: true }
  );

  res.status(201).json({
    success: true,
    wishlist: await buildWishlistResponse(req.user.id),
  });
});

// @route DELETE /api/wishlist/:productId
const removeFromWishlist = asyncHandler(async (req, res) => {
  await Wishlist.updateOne(
    { user: req.user.id },
    { $pull: { products: String(req.params.productId) } }
  );

  res.json({
    success: true,
    wishlist: await buildWishlistResponse(req.user.id),
  });
});

module.exports = {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  buildWishlistResponse,
};
