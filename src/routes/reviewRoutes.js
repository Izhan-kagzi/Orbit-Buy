const crypto = require("crypto");

const { readDB, writeDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/* ============================================================
   HELPERS
============================================================ */

function ensureReviews(db) {
  if (!Array.isArray(db.reviews)) {
    db.reviews = [];
  }

  return db.reviews;
}

function getProduct(db, productId) {
  if (!Array.isArray(db.products)) return null;

  return db.products.find(
    (product) => String(product.id) === String(productId)
  );
}

function getReviewDate(review) {
  if (!review?.createdAt) return "";

  const date = new Date(review.createdAt);

  if (Number.isNaN(date.getTime())) {
    return review.createdAt;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function normalizeReview(review, db) {
  const product = getProduct(db, review.productId);

  return {
    ...review,

    productName:
      review.productName ||
      product?.name ||
      "Unknown Product",

    productImage:
      review.productImage ||
      product?.image ||
      null,

    date: getReviewDate(review),

    reply: review.reply || null,
  };
}

function updateProductReviewStats(db, productId) {
  const product = getProduct(db, productId);

  if (!product) return;

  const reviews = ensureReviews(db).filter(
    (review) =>
      String(review.productId) === String(productId) &&
      review.status === "approved"
  );

  product.reviews = reviews.length;

  if (reviews.length === 0) {
    product.rating = 0;
    return;
  }

  const total = reviews.reduce(
    (sum, review) => sum + Number(review.rating || 0),
    0
  );

  product.rating = Number((total / reviews.length).toFixed(1));
}

/* ============================================================
   GET PRODUCT REVIEWS
   Public
   GET /api/reviews/product/:productId
============================================================ */

const getProductReviews = asyncHandler(async (req, res) => {
  const db = readDB();

  const product = getProduct(db, req.params.productId);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const reviews = ensureReviews(db)
    .filter(
      (review) =>
        String(review.productId) === String(req.params.productId) &&
        review.status === "approved"
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0) -
        new Date(a.createdAt || 0)
    )
    .map((review) => normalizeReview(review, db));

  res.json({
    success: true,
    count: reviews.length,
    reviews,
  });
});

/* ============================================================
   GET ALL REVIEWS
   Admin / Manager
   GET /api/reviews
============================================================ */

const getAllReviews = asyncHandler(async (req, res) => {
  const db = readDB();

  let reviews = ensureReviews(db)
    .filter((review) => review.status !== "deleted")
    .map((review) => normalizeReview(review, db));

  const {
    search,
    rating,
    status,
    productId,
  } = req.query;

  if (search) {
    const keyword = String(search).toLowerCase();

    reviews = reviews.filter((review) => {
      return (
        String(review.userName || "")
          .toLowerCase()
          .includes(keyword) ||
        String(review.userEmail || "")
          .toLowerCase()
          .includes(keyword) ||
        String(review.comment || "")
          .toLowerCase()
          .includes(keyword) ||
        String(review.productName || "")
          .toLowerCase()
          .includes(keyword)
      );
    });
  }

  if (rating && rating !== "all") {
    reviews = reviews.filter(
      (review) => Number(review.rating) === Number(rating)
    );
  }

  if (status && status !== "all") {
    reviews = reviews.filter(
      (review) => review.status === status
    );
  }

  if (productId) {
    reviews = reviews.filter(
      (review) =>
        String(review.productId) === String(productId)
    );
  }

  reviews.sort(
    (a, b) =>
      new Date(b.createdAt || 0) -
      new Date(a.createdAt || 0)
  );

  res.json({
    success: true,
    count: reviews.length,
    reviews,
  });
});

/* ============================================================
   CREATE REVIEW
   Customer
   POST /api/reviews
============================================================ */

const createReview = asyncHandler(async (req, res) => {
  const db = readDB();
  const reviews = ensureReviews(db);

  const {
    productId,
    rating,
    comment,
  } = req.body;

  if (!productId) {
    throw new ApiError(400, "Product ID is required.");
  }

  if (!rating) {
    throw new ApiError(400, "Please select a rating.");
  }

  const numericRating = Number(rating);

  if (
    !Number.isInteger(numericRating) ||
    numericRating < 1 ||
    numericRating > 5
  ) {
    throw new ApiError(
      400,
      "Rating must be between 1 and 5."
    );
  }

  if (!comment || !String(comment).trim()) {
    throw new ApiError(400, "Please write your review.");
  }

  const product = getProduct(db, productId);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const userId = req.user?.id || null;

  /*
    Prevent the same logged-in customer from repeatedly
    submitting reviews for the same product.
  */
  if (userId) {
    const alreadyReviewed = reviews.some(
      (review) =>
        review.userId === userId &&
        String(review.productId) === String(productId) &&
        review.status !== "deleted"
    );

    if (alreadyReviewed) {
      throw new ApiError(
        409,
        "You have already reviewed this product."
      );
    }
  }

  const userName =
    req.user?.name ||
    req.body.name ||
    "Orbit Buy Customer";

  const userEmail =
    req.user?.email ||
    req.body.email ||
    "";

  const newReview = {
    id: `review-${crypto.randomUUID().slice(0, 8)}`,

    productId: String(productId),

    productName: product.name,

    productImage: product.image || null,

    userId,

    userName: String(userName).trim(),

    userEmail: String(userEmail).trim(),

    rating: numericRating,

    comment: String(comment).trim(),

    verified: false,

    helpful: 0,

    status: "approved",

    createdAt: new Date().toISOString(),

    reply: null,
  };

  reviews.unshift(newReview);

  updateProductReviewStats(db, productId);

  writeDB(db);

  res.status(201).json({
    success: true,
    message: "Review submitted successfully.",
    review: normalizeReview(newReview, db),
  });
});

/* ============================================================
   REPLY TO REVIEW
   Admin / Manager
   POST/PUT /api/reviews/:id/reply
============================================================ */

const replyToReview = asyncHandler(async (req, res) => {
  const db = readDB();

  const reviews = ensureReviews(db);

  const review = reviews.find(
    (item) => String(item.id) === String(req.params.id)
  );

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  const text = String(req.body.reply || "").trim();

  if (!text) {
    throw new ApiError(400, "Reply cannot be empty.");
  }

  if (text.length > 1000) {
    throw new ApiError(
      400,
      "Reply cannot exceed 1000 characters."
    );
  }

  const now = new Date().toISOString();

  review.reply = {
    text,

    authorId: req.user?.id || null,

    authorName: req.user?.name || "Orbit Buy",

    authorRole: req.user?.role || "manager",

    createdAt:
      review.reply?.createdAt || now,

    updatedAt: now,
  };

  writeDB(db);

  res.json({
    success: true,
    message: review.reply.createdAt === now
      ? "Reply added successfully."
      : "Reply updated successfully.",
    review: normalizeReview(review, db),
  });
});

/* ============================================================
   DELETE REPLY
   Admin / Manager
   DELETE /api/reviews/:id/reply
============================================================ */

const deleteReply = asyncHandler(async (req, res) => {
  const db = readDB();

  const reviews = ensureReviews(db);

  const review = reviews.find(
    (item) => String(item.id) === String(req.params.id)
  );

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  if (!review.reply) {
    throw new ApiError(404, "This review has no reply.");
  }

  review.reply = null;

  writeDB(db);

  res.json({
    success: true,
    message: "Reply deleted successfully.",
  });
});

/* ============================================================
   DELETE CUSTOMER REVIEW
   Admin / Manager
   DELETE /api/reviews/:id
============================================================ */

const deleteReview = asyncHandler(async (req, res) => {
  const db = readDB();

  const reviews = ensureReviews(db);

  const index = reviews.findIndex(
    (review) =>
      String(review.id) === String(req.params.id)
  );

  if (index === -1) {
    throw new ApiError(404, "Review not found.");
  }

  const review = reviews[index];

  /*
    Completely remove the review from the database.
  */
  reviews.splice(index, 1);

  updateProductReviewStats(db, review.productId);

  writeDB(db);

  res.json({
    success: true,
    message: "Customer review deleted successfully.",
  });
});

/* ============================================================
   APPROVE REVIEW
   Admin / Manager
   PUT /api/reviews/:id/approve
============================================================ */

const approveReview = asyncHandler(async (req, res) => {
  const db = readDB();

  const reviews = ensureReviews(db);

  const review = reviews.find(
    (item) =>
      String(item.id) === String(req.params.id)
  );

  if (!review) {
    throw new ApiError(404, "Review not found.");
  }

  review.status = "approved";

  updateProductReviewStats(db, review.productId);

  writeDB(db);

  res.json({
    success: true,
    message: "Review approved successfully.",
    review: normalizeReview(review, db),
  });
});

/* ============================================================
   EXPORTS
============================================================ */

module.exports = {
  getProductReviews,
  getAllReviews,
  createReview,
  replyToReview,
  deleteReply,
  deleteReview,
  approveReview,
};