const Product = require("../models/Product");
const Review = require("../models/Review");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const { VALID_SLUGS } = Product;

/*
=====================================================
HELPERS
=====================================================
*/

/* Safely convert FormData boolean values. */
function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

/* Get files safely from a multer upload.fields() request. */
function getFiles(req, fieldName) {
  if (!req.files || !req.files[fieldName]) return [];
  return Array.isArray(req.files[fieldName]) ? req.files[fieldName] : [];
}

function getUploadedImages(req) {
  return getFiles(req, "images").map(
    (file) => `/uploads/custom/${file.filename}`
  );
}

function getUploadedVideos(req) {
  return getFiles(req, "videos").map(
    (file) => `/uploads/custom/${file.filename}`
  );
}

/* Backward compatibility for legacy upload.single("image") */
function getLegacyImage(req) {
  const files = getFiles(req, "image");
  if (!files.length) return null;
  return `/uploads/custom/${files[0].filename}`;
}

/* Safely parse an array sent through FormData (JSON string, CSV or array). */
function parseArrayField(value) {
  if (value === undefined || value === null || value === "") return null;

  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
      return [String(parsed)].filter(Boolean);
    } catch (error) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  throw new ApiError(400, "Invalid media array format.");
}

function uniqueArray(values) {
  return [...new Set(Array.isArray(values) ? values.filter(Boolean) : [])];
}

function getProductImages(product) {
  const images = Array.isArray(product.images) ? [...product.images] : [];

  if (product.image && !images.includes(product.image)) {
    images.unshift(product.image);
  }

  return uniqueArray(images);
}

function getProductVideos(product) {
  return Array.isArray(product.videos) ? uniqueArray(product.videos) : [];
}

function parseSizes(sizes, fallback) {
  if (sizes === undefined || sizes === "") return fallback;

  if (Array.isArray(sizes)) return sizes.filter(Boolean);

  return String(sizes)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/*
=====================================================
GET PRODUCTS
GET /api/products
=====================================================
*/

const getProducts = asyncHandler(async (req, res) => {
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

  const filter = {};

  if (slug) filter.slug = slug;

  if (category && category !== "All") {
    filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
  }

  if (brand) {
    filter.brand = new RegExp(`^${escapeRegex(brand)}$`, "i");
  }

  if (bestSeller === "true") filter.isBestSeller = true;
  if (newArrival === "true") filter.isNewArrival = true;

  if (onSale === "true") {
    filter.$expr = { $gt: ["$oldPrice", "$price"] };
  }

  if (q) {
    const keyword = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { name: keyword },
      { category: keyword },
      { brand: keyword },
      { type: keyword },
      { description: keyword },
    ];
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  const sortMap = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1 },
    newest: { createdAt: -1 },
  };

  const sortBy = sortMap[sort] || { createdAt: -1 };

  const total = await Product.countDocuments(filter);

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || total || 1, 200);
  const skip = (page - 1) * limit;

  const products = await Product.find(filter)
    .sort(sortBy)
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    count: total,
    page,
    pages: Math.ceil(total / limit) || 1,
    products: products.map((p) => p.toJSON()),
  });
});

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
=====================================================
GET BRANDS
=====================================================
*/

const getBrands = asyncHandler(async (req, res) => {
  const brands = (await Product.distinct("brand")).filter(Boolean).sort();

  res.json({ success: true, brands });
});

/*
=====================================================
GET PRODUCT BY ID
=====================================================
*/

const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  res.json({ success: true, product: product.toJSON() });
});

/*
=====================================================
GET RELATED PRODUCTS
=====================================================
*/

const getRelatedProducts = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).lean();

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const related = await Product.find({
    _id: { $ne: product._id },
    $or: [
      { slug: product.slug },
      { category: product.category },
      ...(product.type ? [{ type: product.type }] : []),
    ],
  }).limit(8);

  res.json({ success: true, products: related.map((p) => p.toJSON()) });
});

/*
=====================================================
CREATE PRODUCT
POST /api/products   (admin / manager)
=====================================================
*/

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

  if (!name || !category || !slug || price === undefined || price === "") {
    throw new ApiError(400, "name, category, slug and price are required.");
  }

  if (!VALID_SLUGS.includes(slug)) {
    throw new ApiError(400, `slug must be one of: ${VALID_SLUGS.join(", ")}`);
  }

  if (!["Men", "Women"].includes(category)) {
    throw new ApiError(400, 'category must be "Men" or "Women".');
  }

  // Uploaded media processing
  let images = getUploadedImages(req);
  const legacyImage = getLegacyImage(req);

  if (legacyImage && !images.includes(legacyImage)) {
    images.unshift(legacyImage);
  }

  const bodyImages = parseArrayField(req.body.images);
  if (bodyImages) images = [...bodyImages, ...images];

  if (req.body.image && !images.includes(req.body.image)) {
    images.unshift(req.body.image);
  }

  images = uniqueArray(images);

  const videos = uniqueArray([
    ...(parseArrayField(req.body.videos) || []),
    ...getUploadedVideos(req),
  ]);

  const product = await Product.create({
    slug,
    name: String(name).trim(),
    brand: brand || "OrbitBuy",
    category,
    type: type || null,
    description: description || "",
    sizes: parseSizes(sizes, ["S", "M", "L", "XL"]),
    price: Number(price),
    oldPrice: oldPrice ? Number(oldPrice) : null,
    rating: 4.5,
    reviews: 0,
    stock: stock !== undefined && stock !== "" ? Number(stock) : 20,
    isBestSeller: parseBool(isBestSeller),
    isNewArrival: parseBool(isNewArrival),
    image: images.length > 0 ? images[0] : null,
    images,
    videos,
  });

  res.status(201).json({ success: true, product: product.toJSON() });
});

/*
=====================================================
UPDATE PRODUCT
PUT /api/products/:id   (admin / manager)
=====================================================
*/

const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

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
    throw new ApiError(400, `slug must be one of: ${VALID_SLUGS.join(", ")}`);
  }

  if (category && !["Men", "Women"].includes(category)) {
    throw new ApiError(400, 'category must be "Men" or "Women".');
  }

  if (name !== undefined) product.name = name;
  if (brand !== undefined) product.brand = brand;
  if (category !== undefined) product.category = category;
  if (slug !== undefined) product.slug = slug;
  if (type !== undefined) product.type = type || null;
  if (description !== undefined) product.description = description;

  if (price !== undefined && price !== "") product.price = Number(price);

  if (oldPrice !== undefined) {
    product.oldPrice = oldPrice === "" || oldPrice === null ? null : Number(oldPrice);
  }

  if (stock !== undefined && stock !== "") product.stock = Number(stock);

  if (sizes !== undefined && sizes !== "") {
    product.sizes = parseSizes(sizes, product.sizes);
  }

  if (isBestSeller !== undefined) {
    product.isBestSeller = parseBool(isBestSeller, product.isBestSeller);
  }

  if (isNewArrival !== undefined) {
    product.isNewArrival = parseBool(isNewArrival, product.isNewArrival);
  }

  /* ---- Existing images retention ---- */
  let finalImages = getProductImages(product);

  if (req.body.existingImages !== undefined) {
    finalImages = parseArrayField(req.body.existingImages) || [];
  }

  /* ---- Existing videos retention ---- */
  let finalVideos = getProductVideos(product);

  if (req.body.existingVideos !== undefined) {
    finalVideos = parseArrayField(req.body.existingVideos) || [];
  }

  /* ---- Newly uploaded media ---- */
  const newImages = getUploadedImages(req);
  const legacyImage = getLegacyImage(req);

  if (legacyImage && !newImages.includes(legacyImage)) {
    newImages.unshift(legacyImage);
  }

  finalImages = uniqueArray([...finalImages, ...newImages]);
  finalVideos = uniqueArray([...finalVideos, ...getUploadedVideos(req)]);

  if (finalImages.length === 0 && req.body.image) {
    finalImages = [req.body.image];
  }

  product.images = finalImages;
  product.image = finalImages.length > 0 ? finalImages[0] : null;
  product.videos = finalVideos;

  await product.save();

  res.json({ success: true, product: product.toJSON() });
});

/*
=====================================================
DELETE PRODUCT
DELETE /api/products/:id   (admin / manager)
=====================================================
*/

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  await Promise.all([
    Product.deleteOne({ _id: product._id }),
    // Don't leave dangling references behind.
    Review.deleteMany({ productId: product._id }),
    Cart.updateMany({}, { $pull: { items: { productId: String(product._id) } } }),
    Wishlist.updateMany({}, { $pull: { products: String(product._id) } }),
  ]);

  res.json({ success: true, message: "Product deleted successfully." });
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
