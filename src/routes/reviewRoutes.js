const express = require("express");

const {
  getProductReviews,
  getAllReviews,
  createReview,
  replyToReview,
  deleteReply,
  deleteReview,
  approveReview,
} = require("../controllers/reviewController");

const {
  protect,
  staffOnly,
} = require("../middleware/auth");

const router = express.Router();

// ============================================================
// PUBLIC
// ============================================================

// GET /api/reviews/product/:productId
router.get(
  "/product/:productId",
  getProductReviews
);

// ============================================================
// CUSTOMER
// ============================================================

// POST /api/reviews
router.post(
  "/",
  protect,
  createReview
);

// ============================================================
// ADMIN / MANAGER
// ============================================================

// GET /api/reviews
router.get(
  "/",
  protect,
  staffOnly,
  getAllReviews
);

// PUT /api/reviews/:id/reply
router.put(
  "/:id/reply",
  protect,
  staffOnly,
  replyToReview
);

// DELETE /api/reviews/:id/reply
router.delete(
  "/:id/reply",
  protect,
  staffOnly,
  deleteReply
);

// PUT /api/reviews/:id/approve
router.put(
  "/:id/approve",
  protect,
  staffOnly,
  approveReview
);

// DELETE /api/reviews/:id
router.delete(
  "/:id",
  protect,
  staffOnly,
  deleteReview
);

// ============================================================
// EXPORT
// ============================================================

module.exports = router;