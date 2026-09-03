const express = require("express");
const {
  placeOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  getStats,
  getSalesStats,
  requestCancellation,
  getCancellationRequests,
  resolveCancellation,
} = require("../controllers/orderController");
const { protect, staffOnly } = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.post("/", placeOrder);
router.get("/", getMyOrders);

router.get("/admin/all", staffOnly, getAllOrders);
router.get("/admin/stats", staffOnly, getStats);
router.get("/admin/sales", staffOnly, getSalesStats);
router.get("/admin/cancellations", staffOnly, getCancellationRequests);

router.get("/:id", getOrderById);
router.post("/:id/request-cancellation", requestCancellation);
router.put("/:id/cancellation", staffOnly, resolveCancellation);

module.exports = router;
