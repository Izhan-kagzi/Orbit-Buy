const Product = require("../models/Product");
const Review = require("../models/Review");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const { VALID_SLUGS } = Product;

/* =========================================================
   HELPERS
========================================================= */

const parseBool = (value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["true", "1", "yes", "on"].includes(
    String(value).toLowerCase()
  );
};

const getFiles = (req, fieldName) => {
  if (!req.files) return [];

  if (Array.isArray(req.files)) {
    return req.files.filter(
      (file) => file && (!fieldName || file.fieldname === fieldName)
    );
  }

  if (Array.isArray(req.files[fieldName])) {
    return req.files[fieldName];
  }

  return [];
};

const getUploadedImages = (req) => {
  const fields = [
    "images",
    "image",
    "productImages",
    "productImage",
  ];

  return fields.flatMap((field) => getFiles(req, field));
};

const getUploadedVideos = (req) => {
  const fields = [
    "videos",
    "video",
    "productVideos",
    "productVideo",
  ];

  return fields.flatMap((field) => getFiles(req, field));
};

const getLegacyImage = (req) => {
  if (req.file) return req.file;

  const images = getUploadedImages(req);

  return images.length ? images[0] : null;
};

const parseArrayField = (value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean);
      }
    } catch (_) {
      // Not JSON; continue with comma-separated parsing.
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
};

const uniqueArray = (items = []) => {
  return [...new Set(items.filter(Boolean).map(String))];
};

const getProductImages = (product) => {
  if (!product) return [];

  const images = [];

  if (Array.isArray(product.images)) {
    images.push(...product.images);
  }

  if (product.image) {
    images.push(product.image);
  }

  return uniqueArray(images);
};

const getProductVideos = (product) => {
  if (!product) return [];

  const videos = [];

  if (Array.isArray(product.videos)) {
    videos.push(...product.videos);
  }

  if (product.video) {
    videos.push(product.video);
  }

  return uniqueArray(videos);
};

const parseSizes = (value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_) {
      // Continue with comma-separated parsing.
    }

    return value
      .split(",")
      .map((size) => size.trim())
      .filter(Boolean);
  }

  return [];
};

/* =========================================================
   PRODUCT LOOKUP
========================================================= */

/**
 * Find a product using either:
 *   1. Mongo/Mongoose _id
 *   2. product id
 *   3. product slug
 *
 * This prevents "Product Not Found" when the frontend URL
 * contains a slug instead of the MongoDB _id.
 */
const findProductByIdentifier = async (identifier) => {
  if (!identifier) {
    return null;
  }

  const value = String(identifier).trim();

  if (!value) {
    return null;
  }

  /* -------------------------------------------------------
     1. Try Mongo/Mongoose _id
  ------------------------------------------------------- */

  try {
    const productById = await Product.findById(value);

    if (productById) {
      return productById;
    }
  } catch (_) {
    // Invalid Mongo ObjectId/string format.
    // Continue with slug/id lookup.
  }

  /* -------------------------------------------------------
     2. Try slug
  ------------------------------------------------------- */

  try {
    const productBySlug = await Product.findOne({
      slug: value,
    });

    if (productBySlug) {
      return productBySlug;
    }
  } catch (_) {
    // Continue to the next lookup.
  }

  /* -------------------------------------------------------
     3. Try id field if the Product schema/data contains
        a separate "id" property.
  ------------------------------------------------------- */

  try {
    const productByCustomId = await Product.findOne({
      id: value,
    });

    if (productByCustomId) {
      return productByCustomId;
    }
  } catch (_) {
    // Ignore and return null below.
  }

  return null;
};

/* =========================================================
   GET PRODUCTS
========================================================= */

const getProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    category,
    brand,
    bestSeller,
    newArrival,
    onSale,
    q,
    minPrice,
    maxPrice,
    slug,
    type,
    sort,
  } = req.query;

  const filter = {};

  /* -------------------------------------------------------
     Category
  ------------------------------------------------------- */

  if (category) {
    filter.category = category;
  }

  /* -------------------------------------------------------
     Brand
  ------------------------------------------------------- */

  if (brand) {
    filter.brand = brand;
  }

  /* -------------------------------------------------------
     Type
  ------------------------------------------------------- */

  if (type) {
    filter.type = type;
  }

  /* -------------------------------------------------------
     Slug
  ------------------------------------------------------- */

  if (slug) {
    filter.slug = slug;
  }

  /* -------------------------------------------------------
     Boolean filters
  ------------------------------------------------------- */

  const bestSellerValue = parseBool(bestSeller);

  if (bestSellerValue !== undefined) {
    filter.bestSeller = bestSellerValue;
  }

  const newArrivalValue = parseBool(newArrival);

  if (newArrivalValue !== undefined) {
    filter.newArrival = newArrivalValue;
  }

  const onSaleValue = parseBool(onSale);

  if (onSaleValue !== undefined) {
    filter.onSale = onSaleValue;
  }

  /* -------------------------------------------------------
     Search
  ------------------------------------------------------- */

  if (q) {
    const searchRegex = new RegExp(String(q).trim(), "i");

    filter.$or = [
      { name: searchRegex },
      { title: searchRegex },
      { description: searchRegex },
      { brand: searchRegex },
      { category: searchRegex },
      { slug: searchRegex },
    ];
  }

  /* -------------------------------------------------------
     Price range
  ------------------------------------------------------- */

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};

    if (minPrice !== undefined && minPrice !== "") {
      filter.price.$gte = Number(minPrice);
    }

    if (maxPrice !== undefined && maxPrice !== "") {
      filter.price.$lte = Number(maxPrice);
    }
  }

  /* -------------------------------------------------------
     Pagination
  ------------------------------------------------------- */

  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip = (currentPage - 1) * perPage;

  /* -------------------------------------------------------
     Sorting
  ------------------------------------------------------- */

  let sortOption = {
    createdAt: -1,
  };

  if (sort) {
    switch (String(sort).toLowerCase()) {
      case "price_asc":
      case "price-low":
      case "low-high":
        sortOption = { price: 1 };
        break;

      case "price_desc":
      case "price-high":
      case "high-low":
        sortOption = { price: -1 };
        break;

      case "name_asc":
      case "name-a-z":
        sortOption = { name: 1 };
        break;

      case "name_desc":
      case "name-z-a":
        sortOption = { name: -1 };
        break;

      case "newest":
        sortOption = { createdAt: -1 };
        break;

      case "oldest":
        sortOption = { createdAt: 1 };
        break;

      default:
        sortOption = {
          createdAt: -1,
        };
    }
  }

  /* -------------------------------------------------------
     Query
  ------------------------------------------------------- */

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(perPage),

    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: products.length,
    total,
    page: currentPage,
    pages: Math.max(Math.ceil(total / perPage), 1),
    products: products.map((product) => product.toJSON()),
  });
});

/* =========================================================
   GET BRANDS
========================================================= */

const getBrands = asyncHandler(async (req, res) => {
  const brands = await Product.distinct("brand");

  res.json({
    success: true,
    brands: brands
      .filter(Boolean)
      .map(String)
      .sort((a, b) => a.localeCompare(b)),
  });
});

/* =========================================================
   GET PRODUCT BY ID OR SLUG
========================================================= */

const getProductById = asyncHandler(async (req, res) => {
  const identifier = decodeURIComponent(
    String(req.params.id || "").trim()
  );

  if (!identifier) {
    throw new ApiError(400, "Product identifier is required.");
  }

  const product = await findProductByIdentifier(identifier);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  res.json({
    success: true,
    product: product.toJSON(),
  });
});

/* =========================================================
   GET RELATED PRODUCTS
========================================================= */

const getRelatedProducts = asyncHandler(async (req, res) => {
  const identifier = decodeURIComponent(
    String(req.params.id || "").trim()
  );

  if (!identifier) {
    throw new ApiError(400, "Product identifier is required.");
  }

  const product = await findProductByIdentifier(identifier);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const productData = product.toObject
    ? product.toObject()
    : product;

  const relatedConditions = [];

  /* -------------------------------------------------------
     Same category
  ------------------------------------------------------- */

  if (productData.category) {
    relatedConditions.push({
      category: productData.category,
    });
  }

  /* -------------------------------------------------------
     Same type
  ------------------------------------------------------- */

  if (productData.type) {
    relatedConditions.push({
      type: productData.type,
    });
  }

  /* -------------------------------------------------------
     Same brand
  ------------------------------------------------------- */

  if (productData.brand) {
    relatedConditions.push({
      brand: productData.brand,
    });
  }

  /* -------------------------------------------------------
     Same slug is generally not useful for related products,
     but preserve the existing behavior if available.
  ------------------------------------------------------- */

  if (productData.slug) {
    relatedConditions.push({
      slug: productData.slug,
    });
  }

  if (!relatedConditions.length) {
    return res.json({
      success: true,
      count: 0,
      products: [],
    });
  }

  const excludeConditions = [];

  if (productData._id !== undefined) {
    excludeConditions.push({
      _id: {
        $ne: productData._id,
      },
    });
  }

  const related = await Product.find({
    ...(excludeConditions.length
      ? excludeConditions[0]
      : {}),
    $or: relatedConditions,
  })
    .limit(8)
    .sort({
      createdAt: -1,
    });

  res.json({
    success: true,
    count: related.length,
    products: related.map((item) => item.toJSON()),
  });
});

/* =========================================================
   CREATE PRODUCT
========================================================= */

const createProduct = asyncHandler(async (req, res) => {
  const body = {
    ...req.body,
  };

  /* -------------------------------------------------------
     Arrays
  ------------------------------------------------------- */

  if (req.body.images !== undefined) {
    body.images = parseArrayField(req.body.images);
  }

  if (req.body.videos !== undefined) {
    body.videos = parseArrayField(req.body.videos);
  }

  if (req.body.tags !== undefined) {
    body.tags = parseArrayField(req.body.tags);
  }

  if (req.body.colors !== undefined) {
    body.colors = parseArrayField(req.body.colors);
  }

  if (req.body.sizes !== undefined) {
    body.sizes = parseSizes(req.body.sizes);
  }

  /* -------------------------------------------------------
     Boolean fields
  ------------------------------------------------------- */

  [
    "bestSeller",
    "newArrival",
    "onSale",
    "featured",
  ].forEach((field) => {
    if (req.body[field] !== undefined) {
      const parsed = parseBool(req.body[field]);

      if (parsed !== undefined) {
        body[field] = parsed;
      }
    }
  });

  /* -------------------------------------------------------
     Numeric fields
  ------------------------------------------------------- */

  [
    "price",
    "originalPrice",
    "discount",
    "stock",
    "rating",
    "numReviews",
  ].forEach((field) => {
    if (
      req.body[field] !== undefined &&
      req.body[field] !== ""
    ) {
      const value = Number(req.body[field]);

      if (!Number.isNaN(value)) {
        body[field] = value;
      }
    }
  });

  /* -------------------------------------------------------
     Uploaded images
  ------------------------------------------------------- */

  const uploadedImages = getUploadedImages(req);

  if (uploadedImages.length) {
    const uploadedImagePaths = uploadedImages.map(
      (file) => `/uploads/products/${file.filename}`
    );

    body.images = uniqueArray([
      ...(body.images || []),
      ...uploadedImagePaths,
    ]);

    if (!body.image) {
      body.image = body.images[0];
    }
  }

  /* -------------------------------------------------------
     Legacy single image
  ------------------------------------------------------- */

  const legacyImage = getLegacyImage(req);

  if (legacyImage && !body.image) {
    body.image = `/uploads/products/${legacyImage.filename}`;
  }

  /* -------------------------------------------------------
     Uploaded videos
  ------------------------------------------------------- */

  const uploadedVideos = getUploadedVideos(req);

  if (uploadedVideos.length) {
    const uploadedVideoPaths = uploadedVideos.map(
      (file) => `/uploads/products/${file.filename}`
    );

    body.videos = uniqueArray([
      ...(body.videos || []),
      ...uploadedVideoPaths,
    ]);

    if (!body.video) {
      body.video = body.videos[0];
    }
  }

  /* -------------------------------------------------------
     Slug validation
  ------------------------------------------------------- */

  if (
    body.slug &&
    Array.isArray(VALID_SLUGS) &&
    VALID_SLUGS.length &&
    !VALID_SLUGS.includes(body.slug)
  ) {
    throw new ApiError(400, "Invalid product slug.");
  }

  /* -------------------------------------------------------
     Create
  ------------------------------------------------------- */

  const product = await Product.create(body);

  res.status(201).json({
    success: true,
    message: "Product created successfully.",
    product: product.toJSON(),
  });
});

/* =========================================================
   UPDATE PRODUCT
========================================================= */

const updateProduct = asyncHandler(async (req, res) => {
  const identifier = decodeURIComponent(
    String(req.params.id || "").trim()
  );

  if (!identifier) {
    throw new ApiError(400, "Product identifier is required.");
  }

  const product = await findProductByIdentifier(identifier);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  const body = {
    ...req.body,
  };

  /* -------------------------------------------------------
     Arrays
  ------------------------------------------------------- */

  if (req.body.images !== undefined) {
    body.images = parseArrayField(req.body.images);
  }

  if (req.body.videos !== undefined) {
    body.videos = parseArrayField(req.body.videos);
  }

  if (req.body.tags !== undefined) {
    body.tags = parseArrayField(req.body.tags);
  }

  if (req.body.colors !== undefined) {
    body.colors = parseArrayField(req.body.colors);
  }

  if (req.body.sizes !== undefined) {
    body.sizes = parseSizes(req.body.sizes);
  }

  /* -------------------------------------------------------
     Boolean fields
  ------------------------------------------------------- */

  [
    "bestSeller",
    "newArrival",
    "onSale",
    "featured",
  ].forEach((field) => {
    if (req.body[field] !== undefined) {
      const parsed = parseBool(req.body[field]);

      if (parsed !== undefined) {
        body[field] = parsed;
      }
    }
  });

  /* -------------------------------------------------------
     Numeric fields
  ------------------------------------------------------- */

  [
    "price",
    "originalPrice",
    "discount",
    "stock",
    "rating",
    "numReviews",
  ].forEach((field) => {
    if (
      req.body[field] !== undefined &&
      req.body[field] !== ""
    ) {
      const value = Number(req.body[field]);

      if (!Number.isNaN(value)) {
        body[field] = value;
      }
    }
  });

  /* -------------------------------------------------------
     Uploaded images
  ------------------------------------------------------- */

  const uploadedImages = getUploadedImages(req);

  if (uploadedImages.length) {
    const uploadedImagePaths = uploadedImages.map(
      (file) => `/uploads/products/${file.filename}`
    );

    body.images = uniqueArray([
      ...(body.images || product.images || []),
      ...uploadedImagePaths,
    ]);

    if (!body.image) {
      body.image = body.images[0];
    }
  }

  /* -------------------------------------------------------
     Legacy image
  ------------------------------------------------------- */

  const legacyImage = getLegacyImage(req);

  if (legacyImage) {
    const legacyPath = `/uploads/products/${legacyImage.filename}`;

    body.image = legacyPath;

    body.images = uniqueArray([
      ...(body.images || product.images || []),
      legacyPath,
    ]);
  }

  /* -------------------------------------------------------
     Uploaded videos
  ------------------------------------------------------- */

  const uploadedVideos = getUploadedVideos(req);

  if (uploadedVideos.length) {
    const uploadedVideoPaths = uploadedVideos.map(
      (file) => `/uploads/products/${file.filename}`
    );

    body.videos = uniqueArray([
      ...(body.videos || product.videos || []),
      ...uploadedVideoPaths,
    ]);

    if (!body.video) {
      body.video = body.videos[0];
    }
  }

  /* -------------------------------------------------------
     Slug validation
  ------------------------------------------------------- */

  if (
    body.slug &&
    Array.isArray(VALID_SLUGS) &&
    VALID_SLUGS.length &&
    !VALID_SLUGS.includes(body.slug)
  ) {
    throw new ApiError(400, "Invalid product slug.");
  }

  /* -------------------------------------------------------
     Update
  ------------------------------------------------------- */

  Object.keys(body).forEach((key) => {
    if (body[key] !== undefined) {
      product[key] = body[key];
    }
  });

  await product.save();

  res.json({
    success: true,
    message: "Product updated successfully.",
    product: product.toJSON(),
  });
});

/* =========================================================
   DELETE PRODUCT
========================================================= */

const deleteProduct = asyncHandler(async (req, res) => {
  const identifier = decodeURIComponent(
    String(req.params.id || "").trim()
  );

  if (!identifier) {
    throw new ApiError(400, "Product identifier is required.");
  }

  const product = await findProductByIdentifier(identifier);

  if (!product) {
    throw new ApiError(404, "Product not found.");
  }

  await product.deleteOne();

  /* -------------------------------------------------------
     Remove product references from carts
  ------------------------------------------------------- */

  try {
    await Cart.updateMany(
      {},
      {
        $pull: {
          items: {
            product: product._id,
          },
        },
      }
    );
  } catch (_) {
    // Cart cleanup should not prevent successful deletion.
  }

  /* -------------------------------------------------------
     Remove product references from wishlists
  ------------------------------------------------------- */

  try {
    await Wishlist.updateMany(
      {},
      {
        $pull: {
          products: product._id,
        },
      }
    );
  } catch (_) {
    // Wishlist cleanup should not prevent successful deletion.
  }

  /* -------------------------------------------------------
     Delete associated reviews
  ------------------------------------------------------- */

  try {
    await Review.deleteMany({
      product: product._id,
    });
  } catch (_) {
    // Review cleanup should not prevent successful deletion.
  }

  res.json({
    success: true,
    message: "Product deleted successfully.",
  });
});

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getProducts,
  getBrands,
  getProductById,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
};