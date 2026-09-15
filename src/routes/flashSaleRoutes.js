const express = require("express");

const {
  getFlashSale,
  updateFlashSale,
  resetFlashSale,
} = require("../controllers/flashSaleController");

const {
  protect,
  staffOnly,
} = require("../middleware/auth");

const upload = require("../middleware/upload");

const router = express.Router();

/* ============================================================
   PUBLIC
============================================================ */

router.get("/", getFlashSale);

/* ============================================================
   ADMIN + MANAGER
============================================================ */

router.put(
  "/",
  protect,
  staffOnly,
  upload.array("images", 6),
  updateFlashSale
);

router.delete(
  "/",
  protect,
  staffOnly,
  resetFlashSale
);

module.exports = router;
