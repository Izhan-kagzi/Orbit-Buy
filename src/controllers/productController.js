const crypto = require("crypto");
const { readDB, writeDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const VALID_SLUGS = [
  "mens-shirts",
  "mens-tshirts",
  "mens-jeans",
  "mens-trackpants",
  "mens-hoodies",
  "mens-jackets",
  "women-dresses",
  "women-partywear",
  "women-jeans",
  "women-cordset",
  "women-formals",
  "women-skirts",
  "women-shirts",
  "women-jumpsuits",
];

// @route GET /api/products
// Supports: ?category=Men|Women  ?q=search  ?sort=price_asc|price_desc|rating
// ?minPrice=  ?maxPrice=  ?page=  ?limit=  ?slug=  ?brand=
// ?bestSeller=true  ?newArrival=true  ?onSale=true
const getProducts = asyncHandler(async (req, res) => {
  const db = readDB();
  let products = [...db.products];

  const {
    category,
    q,
    sort,
    minPrice,
    maxPrice,
    slug,
    brand,
    bestSeller,
    newArrival,
    onSale,
  } = req.query;

  if (slug) {
    products = products.filter((p) => p.slug === slug);
  }

  if (category && category !== "All") {
    products = products.filter(
      (p) => p.category?.toLowerCase() === category.toLowerCase()
    );
  }

  if (brand) {
    products = products.filter(
      (p) => (p.brand || "").toLowerCase() === brand.toLowerCase()
    );
  }

  if (bestSeller === "true") {
    products = products.filter((p) => p.isBestSeller);
  }

  if (newArrival === "true") {
    products = products.filter((p) => p.isNewArrival);
  }

  if (onSale === "true") {
    products = products.filter(
      (p) => p.oldPrice && p.oldPrice > p.price
    );
  }

  if (q) {
    const keyword = q.toLowerCase();
    products = products.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(keyword) ||
        (p.category || "").toLowerCase().includes(keyword) ||
        (p.brand || "").toLowerCase().includes(keyword) ||
        (p.type || "").toLowerCase().includes(keyword)
    );
  }

  if (minPrice) {
    products = products.filter((p) => p.price >= Number(minPrice));
  }

  if (maxPrice) {
    products = products.filter((p) => p.price <= Number(maxPrice));
  }

  switch (sort) {
    case "price_asc":
      products.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      products.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
    default:
      break;
  }

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || products.length, 200);
  const start = (page - 1) * limit;
  const paginated = products.slice(start, start + limit);

  res.json({
    success: true,
    count: products.length,
    page,
    pages: Math.ceil(products.length / limit) || 1,
    products: paginated,
  });
});

// @route GET /api/products/brands
const getBrands = asyncHandler(async (req, res) => {
  const db = readDB();
  const brands = [
    ...new Set(db.products.map((p) => p.brand).filter(Boolean)),
  ].sort();

  res.json({ success: true, brands });
});

// @route GET /api/products/:id
const getProductById = asyncHandler(async (req, res) => {
  const db = readDB();
  const product = db.products.find((p) => String(p.id) === req.params.id);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  res.json({ success: true, product });
});

// @route GET /api/products/:id/related
const getRelatedProducts = asyncHandler(async (req, res) => {
  const db = readDB();
  const product = db.products.find((p) => String(p.id) === req.params.id);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const related = db.products
    .filter(
      (p) =>
        p.id !== product.id &&
        (p.category === product.category || p.type === product.type)
    )
    .slice(0, 8);

  res.json({ success: true, products: related });
});

function parseBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === true || value === "true";
}

// @route POST /api/products  (admin only)
const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    brand,
    category,
    slug,
    type,
    description,
    price,
    oldPrice,
    stock,
    sizes,
    isBestSeller,
    isNewArrival,
  } = req.body;

  if (!name || !category || !slug || !price) {
    throw new ApiError(
      400,
      "name, category, slug and price are required."
    );
  }

  if (!VALID_SLUGS.includes(slug)) {
    throw new ApiError(
      400,
      `slug must be one of: ${VALID_SLUGS.join(", ")}`
    );
  }

  if (!["Men", "Women"].includes(category)) {
    throw new ApiError(400, 'category must be "Men" or "Women".');
  }

  let parsedSizes = ["S", "M", "L", "XL"];
  if (sizes) {
    parsedSizes = Array.isArray(sizes)
      ? sizes
      : String(sizes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  }

  const image = req.file
    ? `/uploads/custom/${req.file.filename}`
    : req.body.image || null;

  const db = readDB();

  const newProduct = {
    id: `custom-${crypto.randomUUID().slice(0, 8)}`,
    slug,
    name,
    brand: brand || "OrbitBuy",
    category,
    type: type || null,
    description: description || "",
    sizes: parsedSizes,
    price: Number(price),
    oldPrice: oldPrice ? Number(oldPrice) : null,
    rating: 4.5,
    reviews: 0,
    stock: stock ? Number(stock) : 20,
    isBestSeller: parseBool(isBestSeller),
    isNewArrival: parseBool(isNewArrival),
    image,
    createdAt: new Date().toISOString(),
  };

  db.products.unshift(newProduct);
  writeDB(db);

  res.status(201).json({ success: true, product: newProduct });
});

// @route PUT /api/products/:id  (admin only)
const updateProduct = asyncHandler(async (req, res) => {
  const db = readDB();
  const product = db.products.find((p) => p.id === req.params.id);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const {
    name,
    brand,
    category,
    slug,
    type,
    description,
    price,
    oldPrice,
    stock,
    sizes,
    isBestSeller,
    isNewArrival,
  } = req.body;

  if (slug && !VALID_SLUGS.includes(slug)) {
    throw new ApiError(
      400,
      `slug must be one of: ${VALID_SLUGS.join(", ")}`
    );
  }

  if (name) product.name = name;
  if (brand) product.brand = brand;
  if (category) product.category = category;
  if (slug) product.slug = slug;
  if (type !== undefined) product.type = type;
  if (description !== undefined) product.description = description;
  if (price) product.price = Number(price);
  if (oldPrice !== undefined) {
    product.oldPrice = oldPrice ? Number(oldPrice) : null;
  }
  if (stock !== undefined) product.stock = Number(stock);
  if (isBestSeller !== undefined) {
    product.isBestSeller = parseBool(isBestSeller);
  }
  if (isNewArrival !== undefined) {
    product.isNewArrival = parseBool(isNewArrival);
  }

  if (sizes) {
    product.sizes = Array.isArray(sizes)
      ? sizes
      : String(sizes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  }

  if (req.file) {
    product.image = `/uploads/custom/${req.file.filename}`;
  } else if (req.body.image) {
    product.image = req.body.image;
  }

  writeDB(db);

  res.json({ success: true, product });
});

// @route DELETE /api/products/:id  (admin only)
const deleteProduct = asyncHandler(async (req, res) => {
  const db = readDB();
  const exists = db.products.some((p) => p.id === req.params.id);

  if (!exists) {
    throw new ApiError(404, "Product not found.");
  }

  db.products = db.products.filter((p) => p.id !== req.params.id);
  writeDB(db);

  res.json({ success: true, message: "Product deleted." });
});

module.exports = {
  getProducts,
  getBrands,
  getProductById,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  VALID_SLUGS,
};
