const Review = require("../models/Review");
const Product = require("../models/Product");
const User = require("../models/User");
const Order = require("../models/Order");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Reviews.
 *
 * Customers post one review per product. Admins and managers can list
 * every review, reply to a customer's review, edit or remove that
 * reply, approve/unapprove a review, and delete a review outright.
 *
 * REVIEW_AUTO_APPROVE=false in .env switches the store to moderated
 * mode, where new reviews stay hidden until staff approve them.
 */

const AUTO_APPROVE =
  String(process.env.REVIEW_AUTO_APPROVE || "true").toLowerCase() !== "false";

const isStaff = (req) =>
  Boolean(req.user && ["admin", "manager"].includes(req.user.role));

/* ============================================================
   GET PRODUCT REVIEWS
   GET /api/reviews/product/:productId
   PUBLIC
============================================================ */

const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  if (!productId) {
    throw new ApiError(400, "Product ID is required.");
  }

  const product = await Product.findById(productId).lean();

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  // Staff previewing the product page see pending reviews too.
  const filter = { productId: String(productId) };
  if (!isStaff(req)) filter.approved = true;

  const reviews = await Review.find(filter).sort({ createdAt: -1 });

  const summary = await Review.aggregate([
    { $match: { productId: String(productId), approved: true } },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
  ]);

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;
  let totalCount = 0;

  summary.forEach(({ _id, count }) => {
    breakdown[_id] = count;
    totalRating += _id * count;
    totalCount += count;
  });

  res.json({
    success: true,
    count: reviews.length,
    averageRating: totalCount
      ? Number((totalRating / totalCount).toFixed(1))
      : 0,
    breakdown,
    reviews: reviews.map((review) => review.toJSON()),
  });
});

/* ============================================================
   GET ALL REVIEWS
   GET /api/reviews
   ADMIN / MANAGER
============================================================ */

const getAllReviews = asyncHandler(async (req, res) => {
  const { productId, rating, approved, replied, q } = req.query;

  const filter = {};

  if (productId) filter.productId = String(productId);
  if (rating) filter.rating = Number(rating);

  if (approved === "true") filter.approved = true;
  if (approved === "false") filter.approved = false;

  if (replied === "true") filter.reply = { $ne: null };
  if (replied === "false") filter.reply = null;

  if (q) {
    const keyword = new RegExp(
      String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );
    filter.$or = [
      { comment: keyword },
      { userName: keyword },
      { userEmail: keyword },
      { productName: keyword },
    ];
  }

  const reviews = await Review.find(filter).sort({ createdAt: -1 });

  res.json({
    success: true,
    count: reviews.length,
    pending: await Review.countDocuments({ approved: false }),
    unanswered: await Review.countDocuments({ reply: null }),
    reviews: reviews.map((review) => review.toJSON()),
  });
});

/* ============================================================
   CREATE REVIEW
   POST /api/reviews
   CUSTOMER (logged in)
============================================================ */

const createReview = asyncHandler(async (req, res) => {
  const { productId, product_id, rating, comment } = req.body;

  const finalProductId = productId ?? product_id;

  if (!finalProductId) {
    throw new ApiError(400, "Product ID is required.");
  }

  const numericRating = Number(rating);

  if (
    !Number.isFinite(numericRating) ||
    numericRating < 1 ||
    numericRating > 5
  ) {
    throw new ApiError(400, "Rating must be between 1 and 5.");
  }

  if (!comment || !String(comment).trim()) {
    throw new ApiError(400, "Review comment is required.");
  }

  const product = await Product.findById(finalProductId).lean();

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const existing = await Review.findOne({
    productId: String(finalProductId),
    userId: req.user.id,
  }).lean();

  if (existing) {
    throw new ApiError(409, "You have already reviewed this product.");
  }

  const user = await User.findById(req.user.id).lean();

  // Flag reviews written by someone who actually bought the product.
  const purchased = await Order.exists({
    userId: req.user.id,
    "items.id": String(finalProductId),
    status: { $ne: "Cancelled" },
  });

  const review = await Review.create({
    productId: String(finalProductId),
    userId: req.user.id,
    rating: numericRating,
    comment: String(comment).trim(),
    approved: AUTO_APPROVE,
    reply: null,
    userName: user?.name || req.user.name || "Customer",
    userEmail: user?.email || req.user.email || "",
    productName: product.name || "Product",
    verifiedPurchase: Boolean(purchased),
  });

  await Review.syncProductRating(finalProductId);

  res.status(201).json({
    success: true,
    message: AUTO_APPROVE
      ? "Review submitted successfully."
      : "Review submitted successfully and is awaiting approval.",
    review: review.toJSON(),
  });
});

/* ============================================================
   UPDATE OWN REVIEW
   PUT /api/reviews/:id
   CUSTOMER (own review only)
============================================================ */

const updateMyReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const review = await Review.findById(req.params.id);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  if (String(review.userId) !== req.user.id) {
    throw new ApiError(403, "You can only edit your own review.");
  }

  if (rating !== undefined) {
    const numericRating = Number(rating);
    if (
      !Number.isFinite(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      throw new ApiError(400, "Rating must be between 1 and 5.");
    }
    review.rating = numericRating;
  }

  if (comment !== undefined) {
    if (!String(comment).trim()) {
      throw new ApiError(400, "Review comment is required.");
    }
    review.comment = String(comment).trim();
  }

  await review.save();
  await Review.syncProductRating(review.productId);

  res.json({
    success: true,
    message: "Review updated successfully.",
    review: review.toJSON(),
  });
});

/* ============================================================
   REPLY TO A REVIEW
   PUT  /api/reviews/:id/reply   (also accepts POST)
   ADMIN / MANAGER
============================================================ */

const replyToReview = asyncHandler(async (req, res) => {
  const { reply, response, message, text } = req.body || {};

  // Accept whichever field name the frontend sends.
  const finalReply = reply ?? response ?? message ?? text;

  if (!finalReply || !String(finalReply).trim()) {
    throw new ApiError(400, "Reply message is required.");
  }

  if (String(finalReply).trim().length > 2000) {
    throw new ApiError(400, "Reply is too long (max 2000 characters).");
  }

  const review = await Review.findById(req.params.id);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  review.reply = {
    message: String(finalReply).trim(),
    repliedBy: req.user.id,
    repliedByName: req.user.name,
    repliedByRole: req.user.role,
    repliedAt: new Date(),
  };

  await review.save();

  res.json({
    success: true,
    message: "Reply saved successfully.",
    review: review.toJSON(),
  });
});

/* ============================================================
   DELETE A REPLY
   DELETE /api/reviews/:id/reply
   ADMIN / MANAGER
============================================================ */

const deleteReply = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  if (!review.reply) {
    throw new ApiError(400, "This review has no reply to delete.");
  }

  review.reply = null;
  await review.save();

  res.json({
    success: true,
    message: "Reply deleted successfully.",
    review: review.toJSON(),
  });
});

/* ============================================================
   APPROVE / UNAPPROVE A REVIEW
   PUT /api/reviews/:id/approve   { approved?: boolean }
   ADMIN / MANAGER
============================================================ */

const approveReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  const { approved } = req.body || {};

  review.approved =
    approved === undefined
      ? true
      : approved === true || approved === "true" || approved === 1;

  await review.save();
  await Review.syncProductRating(review.productId);

  res.json({
    success: true,
    message: review.approved
      ? "Review approved successfully."
      : "Review hidden from the storefront.",
    review: review.toJSON(),
  });
});

/* ============================================================
   DELETE A REVIEW
   DELETE /api/reviews/:id
   ADMIN / MANAGER  (a customer may delete their own)
============================================================ */

const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  const isOwner = String(review.userId) === req.user.id;

  if (!isStaff(req) && !isOwner) {
    throw new ApiError(403, "You can only delete your own review.");
  }

  const { productId } = review;

  await Review.deleteOne({ _id: review._id });
  await Review.syncProductRating(productId);

  res.json({
    success: true,
    message: "Review deleted successfully.",
    id: String(review._id),
  });
});

module.exports = {
  getProductReviews,
  getAllReviews,
  createReview,
  updateMyReview,
  replyToReview,
  deleteReply,
  deleteReview,
  approveReview,
};
