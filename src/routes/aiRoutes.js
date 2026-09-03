const express = require("express");
const { compareProducts, recommendProducts } = require("../controllers/aiController");

const router = express.Router();

// These endpoints only read the public product catalog; no user/session data is required.
router.post("/compare", compareProducts);
router.post("/recommend", recommendProducts);

module.exports = router;
