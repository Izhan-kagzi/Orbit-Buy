const express = require("express");
const {
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
  getLiveOrders,
  streamOrders,
  closeLiveTracking,
} = require("../controllers/orderController");
const { protect, staffOnly } = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.post("/", placeOrder);
router.get("/", getMyOrders);

/* Live tracking — before "/:id" so they aren't shadowed. */
router.get("/live", getLiveOrders);
router.get("/stream", streamOrders);

/* Admin / manager — declared before "/:id" so they aren't shadowed. */
router.get("/admin/all", staffOnly, getAllOrders);
router.get("/admin/stats", staffOnly, getStats);
router.get("/admin/sales", staffOnly, getSalesStats);
router.get("/admin/cancellations", staffOnly, getCancellationRequests);

router.get("/:id", getOrderById);
router.post("/:id/request-cancellation", requestCancellation);
router.put("/:id/cancellation", staffOnly, resolveCancellation);
router.put("/:id/status", staffOnly, updateOrderStatus);
router.put("/:id/live/close", staffOnly, closeLiveTracking);

module.exports = router;
