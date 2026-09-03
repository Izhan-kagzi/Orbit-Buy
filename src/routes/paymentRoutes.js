const express = require("express");
const { createPaymentIntent, getPaymentConfig } = require("../controllers/paymentController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.get("/config", getPaymentConfig);
router.post("/create-intent", protect, createPaymentIntent);

module.exports = router;
