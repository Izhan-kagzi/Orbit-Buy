const express = require("express");

const {
  getFlashSales,
  getActiveFlashSale,
  getFlashSaleById,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
  deleteAllFlashSales,
} = require("../controllers/flashSaleController");

const { protect, staffOnly } = require("../middleware/auth");
const { uploadFlashSaleImages } = require("../middleware/upload");

const router = express.Router();

/* ============================================================
   PUBLIC
============================================================ */

// The sale running right now (storefront banner).
router.get("/", getActiveFlashSale);

// Every sale, newest first. Optional ?status=active|upcoming|ended|inactive
router.get("/all", getFlashSales);

/* ============================================================
   ADMIN + MANAGER
============================================================ */

// ADD a flash sale (title, description, startTime, endTime, images…)
router.post("/", protect, staffOnly, uploadFlashSaleImages, createFlashSale);

// Remove every flash sale — keeps the old "reset" button working.
router.delete("/", protect, staffOnly, deleteAllFlashSales);

/* ============================================================
   SINGLE SALE — keep the :id routes last so "/all" isn't
   swallowed by "/:id".
============================================================ */

router.get("/:id", getFlashSaleById);

router.put("/:id", protect, staffOnly, uploadFlashSaleImages, updateFlashSale);
router.patch("/:id", protect, staffOnly, uploadFlashSaleImages, updateFlashSale);

// DELETE one flash sale.
router.delete("/:id", protect, staffOnly, deleteFlashSale);

module.exports = router;
