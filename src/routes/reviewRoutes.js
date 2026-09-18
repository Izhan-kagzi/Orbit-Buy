const express = require("express");

const {
  getProductReviews,
  getAllReviews,
  createReview,
  updateMyReview,
  replyToReview,
  deleteReply,
  deleteReview,
  approveReview,
} = require("../controllers/reviewController");

const { protect, staffOnly, optionalAuth } = require("../middleware/auth");

const router = express.Router();

/* ============================================================
   ADMIN / MANAGER — list every review
   (declared before "/:id" style routes so it isn't shadowed)
============================================================ */

// GET /api/reviews
router.get("/", protect, staffOnly, getAllReviews);

/* ============================================================
   PUBLIC
============================================================ */

// GET /api/reviews/product/:productId
router.get("/product/:productId", optionalAuth, getProductReviews);

/* ============================================================
   CUSTOMER
============================================================ */

// POST /api/reviews
router.post("/", protect, createReview);

// PUT /api/reviews/:id  — edit your own review
router.put("/:id", protect, updateMyReview);

/* ============================================================
   ADMIN / MANAGER — reply, approve, delete
============================================================ */

// Reply to a customer review (PUT and POST both accepted).
router.put("/:id/reply", protect, staffOnly, replyToReview);
router.post("/:id/reply", protect, staffOnly, replyToReview);

// Remove a staff reply.
router.delete("/:id/reply", protect, staffOnly, deleteReply);

// Approve / unapprove a review.
router.put("/:id/approve", protect, staffOnly, approveReview);
router.patch("/:id/approve", protect, staffOnly, approveReview);

// DELETE /api/reviews/:id — staff can delete any review,
// a customer can delete their own.
router.delete("/:id", protect, deleteReview);

module.exports = router;
