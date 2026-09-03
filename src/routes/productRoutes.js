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
const upload = require("../middleware/upload");

const router = express.Router();

router.get("/", getProducts);
router.get("/brands", getBrands);
router.get("/:id", getProductById);
router.get("/:id/related", getRelatedProducts);

// Managers get full product/inventory control alongside admins.
router.post(
  "/",
  protect,
  staffOnly,
  upload.single("image"),
  createProduct
);

router.put(
  "/:id",
  protect,
  staffOnly,
  upload.single("image"),
  updateProduct
);

router.delete("/:id", protect, staffOnly, deleteProduct);

module.exports = router;
