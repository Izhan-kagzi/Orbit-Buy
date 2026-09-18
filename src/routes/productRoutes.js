const express = require("express");

const {
  getProducts,
  getBrands,
  getProductById,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const { protect, staffOnly } = require("../middleware/auth");
const { uploadProductMedia } = require("../middleware/upload");

const router = express.Router();

/* ============================================================
   PUBLIC
============================================================ */

router.get("/", getProducts);
router.get("/brands", getBrands);
router.get("/:id", getProductById);
router.get("/:id/related", getRelatedProducts);

/* ============================================================
   ADMIN / MANAGER
   Media fields: image (1, legacy), images (10), videos (5)
============================================================ */

router.post("/", protect, staffOnly, uploadProductMedia, createProduct);
router.put("/:id", protect, staffOnly, uploadProductMedia, updateProduct);
router.delete("/:id", protect, staffOnly, deleteProduct);

module.exports = router;
