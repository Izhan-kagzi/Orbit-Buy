const express = require("express");
const PushSubscription = require("../models/PushSubscription");
const { protect } = require("../middleware/auth");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { initPush } = require("../services/liveOrders");

const router = express.Router();

// Public: the browser needs the VAPID public key before subscribing.
router.get("/public-key", (req, res) => {
  res.json({
    success: true,
    enabled: initPush(),
    publicKey: process.env.VAPID_PUBLIC_KEY || null,
  });
});

router.post(
  "/subscribe",
  protect,
  asyncHandler(async (req, res) => {
    const { endpoint, keys } = req.body?.subscription || req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new ApiError(400, "A valid push subscription is required.");
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        userId: req.user.id,
        endpoint,
        keys,
        userAgent: req.get("user-agent") || "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ success: true });
  })
);

router.post(
  "/unsubscribe",
  protect,
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint, userId: req.user.id });
    }
    res.json({ success: true });
  })
);

module.exports = router;
