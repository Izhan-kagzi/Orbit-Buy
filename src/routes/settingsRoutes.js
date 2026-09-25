const express = require("express");

const {
  getMaintenanceStatus,
  updateMaintenance,
} = require("../controllers/settingsController");

const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Public — the storefront polls this to know whether to show the
// maintenance page, and it also has to work while maintenance is on.
router.get("/maintenance", getMaintenanceStatus);

// Admin only — turn maintenance on/off and set its time window/message.
router.put("/maintenance", protect, adminOnly, updateMaintenance);

module.exports = router;