const crypto = require("crypto");

const { readDB, writeDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/*
=====================================================
VALID PRODUCT SLUGS
=====================================================
*/

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

/*
=====================================================
HELPERS
=====================================================
*/

/*
Safely convert FormData boolean values.
*/
function parseBool(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value).toLowerCase() === "true";
}

/*
Get files safely from a multer upload.fields() request.
*/
function getFiles(req, fieldName) {
  if (!req.files || !req.files[fieldName]) {
    return [];
  }

  return Array.isArray(req.files[fieldName])
    ? req.files[fieldName]
    : [];
}

/*
Convert uploaded image files into public local URLs.
*/
function getUploadedImages(req) {
  return getFiles(req, "images").map(
    (file) => `/uploads/custom/${file.filename}`
  );
}

/*
Convert uploaded video files into public local URLs.
*/
function getUploadedVideos(req) {
  return getFiles(req, "videos").map(
    (file) => `/uploads/custom/${file.filename}`
  );
}

/*
Backward compatibility for legacy upload.single("image")
*/
function getLegacyImage(req) {
  const files = getFiles(req, "image");

  if (!files.length) {
    return null;
  }

  return `/uploads/custom/${files[0].filename}`;
}

/*
Safely parse array sent through FormData (JSON strings or standard arrays).
*/
function parseArrayField(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (error) {
      // Fallback: If it's a comma-separated string rather than JSON
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  throw new ApiError(400, "Invalid media format array.");
}

/*
Ensure array items are non-null and distinct.
*/
function uniqueArray(values) {
  return [
    ...new Set(
      Array.isArray(values) ? values.filter(Boolean) : []
    ),
  ];
}

/*
Get all images from a product record.
*/
function getProductImages(product) {
  const images = Array.isArray(product.images)
    ? [...product.images]
    : [];

  if (product.image && !images.includes(product.image)) {
    images.unshift(product.image);
  }

  return uniqueArray(images);
}

/*
Get all videos from a product record.
*/
function getProductVideos(product) {
  return Array.isArray(product.videos)
    ? uniqueArray(product.videos)
    : [];
}

/*
=====================================================
GET PRODUCTS
=====================================================
*/

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
  const limit = Math.min(
    Number(req.query.limit) || products.length,
    200
  );

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

/*
=====================================================
GET BRANDS
=====================================================
*/

const getBrands = asyncHandler(async (req, res) => {
  const db = readDB();

  const brands = [
    ...new Set(db.products.map((p) => p.brand).filter(Boolean)),
  ].sort();

  res.json({
    success: true,
    brands,
  });
});

/*
=====================================================
GET PRODUCT BY ID
=====================================================
*/

const getProductById = asyncHandler(async (req, res) => {
  const db = readDB();

  const product = db.products.find(
    (p) => String(p.id) === req.params.id
  );

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  res.json({
    success: true,
    product,
  });
});

/*
=====================================================
GET RELATED PRODUCTS
=====================================================
*/

const getRelatedProducts = asyncHandler(async (req, res) => {
  const db = readDB();

  const product = db.products.find(
    (p) => String(p.id) === req.params.id
  );

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

  res.json({
    success: true,
    products: related,
  });
});

/*
=====================================================
CREATE PRODUCT
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

  if (!name || !category || !slug || !price) {
    throw new ApiError(400, "name, category, slug and price are required.");
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

  // Uploaded media processing
  let images = getUploadedImages(req);
  const legacyImage = getLegacyImage(req);

  if (legacyImage && !images.includes(legacyImage)) {
    images.unshift(legacyImage);
  }

  if (req.body.image && !images.includes(req.body.image)) {
    images.unshift(req.body.image);
  }

  images = uniqueArray(images);
  const primaryImage = images.length > 0 ? images[0] : null;

  const videos = uniqueArray(getUploadedVideos(req));

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
    image: primaryImage,
    images,
    videos,
    createdAt: new Date().toISOString(),
  };

  db.products.unshift(newProduct);
  writeDB(db);

  res.status(201).json({
    success: true,
    product: newProduct,
  });
});

/*
=====================================================
UPDATE PRODUCT
=====================================================
*/

const updateProduct = asyncHandler(async (req, res) => {
  const db = readDB();

  const product = db.products.find(
    (p) => String(p.id) === req.params.id
  );

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

  if (category && !["Men", "Women"].includes(category)) {
    throw new ApiError(400, 'category must be "Men" or "Women".');
  }

  if (name !== undefined) product.name = name;
  if (brand !== undefined) product.brand = brand;
  if (category !== undefined) product.category = category;
  if (slug !== undefined) product.slug = slug;
  if (type !== undefined) product.type = type;
  if (description !== undefined) product.description = description;

  if (price !== undefined && price !== "") {
    product.price = Number(price);
  }

  if (oldPrice !== undefined) {
    product.oldPrice = oldPrice === "" ? null : Number(oldPrice);
  }

  if (stock !== undefined && stock !== "") {
    product.stock = Number(stock);
  }

  if (sizes !== undefined && sizes !== "") {
    product.sizes = Array.isArray(sizes)
      ? sizes
      : String(sizes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  }

  if (isBestSeller !== undefined) {
    product.isBestSeller = parseBool(isBestSeller);
  }

  if (isNewArrival !== undefined) {
    product.isNewArrival = parseBool(isNewArrival);
  }

  /*
  ---------------------------------------------------
  EXISTING IMAGES RETENTION
  ---------------------------------------------------
  */
  let finalImages = getProductImages(product);

  if (req.body.existingImages !== undefined) {
    const parsed = parseArrayField(req.body.existingImages);
    finalImages = Array.isArray(parsed) ? parsed : [];
  }

  /*
  ---------------------------------------------------
  EXISTING VIDEOS RETENTION
  ---------------------------------------------------
  */
  let finalVideos = getProductVideos(product);

  if (req.body.existingVideos !== undefined) {
    const parsed = parseArrayField(req.body.existingVideos);
    finalVideos = Array.isArray(parsed) ? parsed : [];
  }

  /*
  ---------------------------------------------------
  NEW UPLOADED MEDIA ATTACHMENT
  ---------------------------------------------------
  */
  const newImages = getUploadedImages(req);
  const legacyImage = getLegacyImage(req);

  if (legacyImage && !newImages.includes(legacyImage)) {
    newImages.unshift(legacyImage);
  }

  finalImages = uniqueArray([...finalImages, ...newImages]);

  const newVideos = getUploadedVideos(req);
  finalVideos = uniqueArray([...finalVideos, ...newVideos]);

  if (finalImages.length === 0 && req.body.image) {
    finalImages = [req.body.image];
  }

  product.images = finalImages;
  product.image = finalImages.length > 0 ? finalImages[0] : null;
  product.videos = finalVideos;

  writeDB(db);

  res.json({
    success: true,
    product,
  });
});

/*
=====================================================
DELETE PRODUCT
=====================================================
*/

const deleteProduct = asyncHandler(async (req, res) => {
  const db = readDB();

  const product = db.products.find(
    (p) => String(p.id) === req.params.id
  );

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  db.products = db.products.filter(
    (p) => String(p.id) !== req.params.id
  );

  writeDB(db);

  res.json({
    success: true,
    message: "Product deleted successfully.",
  });
});

/*
=====================================================
EXPORTS
=====================================================
*/

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