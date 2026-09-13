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

/*
=====================================================
PUBLIC PRODUCT ROUTES
=====================================================
*/

/* GET /api/products */
router.get("/", getProducts);

/* GET /api/products/brands */
router.get("/brands", getBrands);

/* GET /api/products/:id */
router.get("/:id", getProductById);

/* GET /api/products/:id/related */
router.get("/:id/related", getRelatedProducts);

/*
=====================================================
PRODUCT MEDIA UPLOAD MIDDLEWARE
=====================================================
Field specs:
- image:  Max 1 file (legacy support)
- images: Max 10 files
- videos: Max 5 files
=====================================================
*/

const handleMediaUpload = (req, res, next) => {
  const uploadFields = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "images", maxCount: 10 },
    { name: "videos", maxCount: 5 },
  ]);

  uploadFields(req, res, (err) => {
    if (err) {
      // Return clear error responses instead of unhandled 500 crash
      return res.status(400).json({
        success: false,
        message: err.message || "File upload failed",
        code: err.code || "UPLOAD_ERROR",
        field: err.field || null,
      });
    }
    next();
  });
};

/*
=====================================================
PROTECTED ADMIN / STAFF ROUTES
=====================================================
*/

/* CREATE PRODUCT */
router.post(
  "/",
  protect,
  staffOnly,
  handleMediaUpload,
  createProduct
);

/* UPDATE PRODUCT */
router.put(
  "/:id",
  protect,
  staffOnly,
  handleMediaUpload,
  updateProduct
);

/* DELETE PRODUCT */
router.delete(
  "/:id",
  protect,
  staffOnly,
  deleteProduct
);

module.exports = router;