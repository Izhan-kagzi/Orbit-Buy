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
      (file) =>
        file &&
        (!fieldName || file.fieldname === fieldName)
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

// Only the dedicated legacy `image` upload field counts here.
// (Previously this returned the first file of ANY image field, which
// replaced the main image every time new gallery images were added.)
const getLegacyImage = (req) => {
  if (req.file) return req.file;

  const files = getFiles(req, "image");

  return files.length ? files[0] : null;
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
      // Not JSON. Continue with comma-separated parsing.
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
};

const uniqueArray = (items = []) => {
  return [
    ...new Set(
      items
        .filter(Boolean)
        .map(String)
    ),
  ];
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
    return value
      .map((size) => String(size).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed
          .map((size) => String(size).trim())
          .filter(Boolean);
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
   PRODUCT RESPONSE HELPERS
========================================================= */

/**
 * Product schema uses:
 *
 *   isBestSeller
 *   isNewArrival
 *   oldPrice
 *
 * The frontend/admin may still use:
 *
 *   bestSeller
 *   newArrival
 *   onSale
 *
 * This helper exposes the schema fields while also making
 * the derived `onSale` state available in API responses.
 */
const serializeProduct = (product) => {
  if (!product) return null;

  const data =
    typeof product.toJSON === "function"
      ? product.toJSON()
      : { ...product };

  const price = Number(data.price);
  const oldPrice = Number(data.oldPrice);

  const isOnSale =
    Number.isFinite(price) &&
    Number.isFinite(oldPrice) &&
    oldPrice > price;

  // Old records may have `image` but no `images[]`, and edited records
  // can have `images[]` but a null/stale `image`. Always return a
  // consistent set so every product card has something to show.
  const images = uniqueArray([
    ...(Array.isArray(data.images) ? data.images : []),
    data.image,
  ]);

  const videos = uniqueArray([
    ...(Array.isArray(data.videos) ? data.videos : []),
    data.video,
  ]);

  const cover =
    data.image && images.includes(data.image)
      ? data.image
      : images[0] || null;

  return {
    ...data,

    image: cover,
    images,
    videos,

    isBestSeller: Boolean(data.isBestSeller),
    isNewArrival: Boolean(data.isNewArrival),

    // Backward/frontend compatibility.
    bestSeller: Boolean(data.isBestSeller),
    newArrival: Boolean(data.isNewArrival),

    // Derived from oldPrice > price.
    onSale: isOnSale,
  };
};

/* =========================================================
   PRODUCT LOOKUP
========================================================= */

/**
 * Find a product using:
 *
 *   1. Mongo/Mongoose _id
 *   2. product slug
 *   3. legacy/custom id field
 *
 * Product._id is a String in the current Orbit Buy schema.
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
     1. Try _id
  ------------------------------------------------------- */

  try {
    const productById = await Product.findById(value);

    if (productById) {
      return productById;
    }
  } catch (_) {
    // Continue with slug/custom-id lookup.
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
    // Continue with custom-id lookup.
  }

  /* -------------------------------------------------------
     3. Legacy/custom id field
  ------------------------------------------------------- */

  try {
    const productByCustomId = await Product.findOne({
      id: value,
    });

    if (productByCustomId) {
      return productByCustomId;
    }
  } catch (_) {
    // Ignore and return null.
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
     Best Seller
     
     Query parameter:
       ?bestSeller=true
     
     Database field:
       isBestSeller
  ------------------------------------------------------- */

  const bestSellerValue = parseBool(bestSeller);

  if (bestSellerValue !== undefined) {
    filter.isBestSeller = bestSellerValue;
  }

  /* -------------------------------------------------------
     New Arrival
     
     Query parameter:
       ?newArrival=true
     
     Database field:
       isNewArrival
  ------------------------------------------------------- */

  const newArrivalValue = parseBool(newArrival);

  if (newArrivalValue !== undefined) {
    filter.isNewArrival = newArrivalValue;
  }

  /* -------------------------------------------------------
     Sale
     
     There is no `onSale` field in Product.js.
     
     A product is considered on sale when:
     
       oldPrice > price
     
     MongoDB $expr is used so the comparison happens
     directly inside MongoDB.
  ------------------------------------------------------- */

  const onSaleValue = parseBool(onSale);

  if (onSaleValue === true) {
    filter.$expr = {
      $and: [
        {
          $ne: [
            {
              $ifNull: ["$oldPrice", null],
            },
            null,
          ],
        },
        {
          $gt: ["$oldPrice", "$price"],
        },
      ],
    };
  } else if (onSaleValue === false) {
    filter.$or = [
      {
        oldPrice: null,
      },
      {
        $expr: {
          $lte: [
            {
              $ifNull: ["$oldPrice", 0],
            },
            "$price",
          ],
        },
      },
    ];
  }

  /* -------------------------------------------------------
     Search
  ------------------------------------------------------- */

  if (q) {
    const searchText = String(q).trim();

    if (searchText) {
      const searchRegex = new RegExp(searchText, "i");

      const searchConditions = [
        { name: searchRegex },
        { description: searchRegex },
        { brand: searchRegex },
        { category: searchRegex },
        { slug: searchRegex },
        { type: searchRegex },
      ];

      /*
       * If $or already exists because onSale=false,
       * combine the existing conditions with $and.
       */
      if (filter.$or) {
        const saleConditions = filter.$or;

        delete filter.$or;

        filter.$and = [
          {
            $or: saleConditions,
          },
          {
            $or: searchConditions,
          },
        ];
      } else {
        filter.$or = searchConditions;
      }
    }
  }

  /* -------------------------------------------------------
     Price range
  ------------------------------------------------------- */

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};

    if (minPrice !== undefined && minPrice !== "") {
      const value = Number(minPrice);

      if (!Number.isNaN(value)) {
        filter.price.$gte = value;
      }
    }

    if (maxPrice !== undefined && maxPrice !== "") {
      const value = Number(maxPrice);

      if (!Number.isNaN(value)) {
        filter.price.$lte = value;
      }
    }

    if (Object.keys(filter.price).length === 0) {
      delete filter.price;
    }
  }

  /* -------------------------------------------------------
     Pagination
  ------------------------------------------------------- */

  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

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
        sortOption = {
          price: 1,
        };
        break;

      case "price_desc":
      case "price-high":
      case "high-low":
        sortOption = {
          price: -1,
        };
        break;

      case "name_asc":
      case "name-a-z":
        sortOption = {
          name: 1,
        };
        break;

      case "name_desc":
      case "name-z-a":
        sortOption = {
          name: -1,
        };
        break;

      case "newest":
        sortOption = {
          createdAt: -1,
        };
        break;

      case "oldest":
        sortOption = {
          createdAt: 1,
        };
        break;

      case "rating":
      case "rating_desc":
        sortOption = {
          rating: -1,
          reviews: -1,
        };
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
    pages: Math.max(
      Math.ceil(total / perPage),
      1
    ),
    products: products.map(serializeProduct),
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
    throw new ApiError(
      400,
      "Product identifier is required."
    );
  }

  const product =
    await findProductByIdentifier(identifier);

  if (!product) {
    throw new ApiError(
      404,
      "Product not found."
    );
  }

  res.json({
    success: true,
    product: serializeProduct(product),
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
    throw new ApiError(
      400,
      "Product identifier is required."
    );
  }

  const product =
    await findProductByIdentifier(identifier);

  if (!product) {
    throw new ApiError(
      404,
      "Product not found."
    );
  }

  const productData =
    typeof product.toObject === "function"
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
     Same slug
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

  const relatedFilter = {
    $or: relatedConditions,
  };

  /* -------------------------------------------------------
     Exclude current product
  ------------------------------------------------------- */

  if (productData._id !== undefined) {
    relatedFilter._id = {
      $ne: productData._id,
    };
  }

  const related = await Product.find(
    relatedFilter
  )
    .limit(8)
    .sort({
      createdAt: -1,
    });

  res.json({
    success: true,
    count: related.length,
    products: related.map(serializeProduct),
  });
});

/* =========================================================
   NORMALIZE PRODUCT BODY
========================================================= */

const normalizeProductBody = (reqBody = {}) => {
  const body = {
    ...reqBody,
  };

  /* -------------------------------------------------------
     Arrays
  ------------------------------------------------------- */

  if (reqBody.images !== undefined) {
    body.images = parseArrayField(
      reqBody.images
    );
  }

  if (reqBody.videos !== undefined) {
    body.videos = parseArrayField(
      reqBody.videos
    );
  }

  // AdminProductForm sends the media that should remain on an edit
  // as existingImages/existingVideos. Normalize those fields into
  // the schema fields so removals are respected.
  if (reqBody.existingImages !== undefined) {
    body.images = parseArrayField(
      reqBody.existingImages
    );
  }

  if (reqBody.existingVideos !== undefined) {
    body.videos = parseArrayField(
      reqBody.existingVideos
    );
  }

  delete body.existingImages;
  delete body.existingVideos;

  if (reqBody.sizes !== undefined) {
    body.sizes = parseSizes(
      reqBody.sizes
    );
  }

  /*
   * Product.js does not currently define `tags` or `colors`.
   * Do not send them into the schema unnecessarily.
   */
  delete body.tags;
  delete body.colors;

  /* -------------------------------------------------------
     Boolean fields
     
     Frontend/admin compatibility:
       bestSeller -> isBestSeller
       newArrival -> isNewArrival
  ------------------------------------------------------- */

  if (reqBody.isBestSeller !== undefined) {
    const parsed = parseBool(
      reqBody.isBestSeller
    );

    if (parsed !== undefined) {
      body.isBestSeller = parsed;
    }
  }

  if (reqBody.bestSeller !== undefined) {
    const parsed = parseBool(
      reqBody.bestSeller
    );

    if (parsed !== undefined) {
      body.isBestSeller = parsed;
    }
  }

  if (reqBody.isNewArrival !== undefined) {
    const parsed = parseBool(
      reqBody.isNewArrival
    );

    if (parsed !== undefined) {
      body.isNewArrival = parsed;
    }
  }

  if (reqBody.newArrival !== undefined) {
    const parsed = parseBool(
      reqBody.newArrival
    );

    if (parsed !== undefined) {
      body.isNewArrival = parsed;
    }
  }

  /*
   * `onSale` is derived from oldPrice > price.
   * It should NOT be saved as a separate field.
   */
  delete body.bestSeller;
  delete body.newArrival;
  delete body.onSale;
  delete body.featured;

  /* -------------------------------------------------------
     Numeric fields
     
     Product.js supports:
       price
       oldPrice
       stock
       rating
       reviews
  ------------------------------------------------------- */

  const numericFields = [
    "price",
    "oldPrice",
    "stock",
    "rating",
    "reviews",
  ];

  numericFields.forEach((field) => {
    if (
      reqBody[field] !== undefined &&
      reqBody[field] !== ""
    ) {
      const value = Number(
        reqBody[field]
      );

      if (!Number.isNaN(value)) {
        body[field] = value;
      }
    }
  });

  /*
   * Backward compatibility:
   *
   * Some admin forms may submit originalPrice.
   * Map it to Product.oldPrice.
   */
  if (
    reqBody.originalPrice !== undefined &&
    reqBody.originalPrice !== ""
  ) {
    const value = Number(
      reqBody.originalPrice
    );

    if (!Number.isNaN(value)) {
      body.oldPrice = value;
    }
  }

  /*
   * Some admin forms may submit numReviews.
   * Map it to Product.reviews.
   */
  if (
    reqBody.numReviews !== undefined &&
    reqBody.numReviews !== ""
  ) {
    const value = Number(
      reqBody.numReviews
    );

    if (!Number.isNaN(value)) {
      body.reviews = value;
    }
  }

  delete body.originalPrice;
  delete body.discount;
  delete body.numReviews;

  /* -------------------------------------------------------
     ID protection
     
     Never allow an incoming request to replace _id.
  ------------------------------------------------------- */

  delete body._id;
  delete body.id;

  return body;
};

/* =========================================================
   VALIDATE SLUG
========================================================= */

const validateProductSlug = (slug) => {
  if (!slug) {
    return;
  }

  if (
    Array.isArray(VALID_SLUGS) &&
    VALID_SLUGS.length &&
    !VALID_SLUGS.includes(slug)
  ) {
    throw new ApiError(
      400,
      "Invalid product slug."
    );
  }
};

/* =========================================================
   CREATE PRODUCT
========================================================= */

const createProduct = asyncHandler(async (req, res) => {
  const body = normalizeProductBody(
    req.body
  );

  /* -------------------------------------------------------
     Uploaded images
  ------------------------------------------------------- */

  const uploadedImages =
    getUploadedImages(req);

  if (uploadedImages.length) {
    const uploadedImagePaths =
      uploadedImages.map(
        (file) =>
          `/uploads/products/${file.filename}`
      );

    body.images = uniqueArray([
      ...(body.images || []),
      ...uploadedImagePaths,
    ]);

    if (!body.image) {
      body.image =
        body.images[0];
    }
  }

  /* -------------------------------------------------------
     Legacy single image
  ------------------------------------------------------- */

  const legacyImage =
    getLegacyImage(req);

  if (
    legacyImage &&
    !body.image
  ) {
    body.image =
      `/uploads/products/${legacyImage.filename}`;
  }

  /* -------------------------------------------------------
     Uploaded videos
  ------------------------------------------------------- */

  const uploadedVideos =
    getUploadedVideos(req);

  if (uploadedVideos.length) {
    const uploadedVideoPaths =
      uploadedVideos.map(
        (file) =>
          `/uploads/products/${file.filename}`
      );

    body.videos = uniqueArray([
      ...(body.videos || []),
      ...uploadedVideoPaths,
    ]);

    /*
     * Product.js does not define a `video` field.
     * Keep videos in the `videos` array only.
     */
  }

  /* -------------------------------------------------------
     Keep `image` (main image) in sync with `images`
  ------------------------------------------------------- */

  if (body.image) {
    body.images = uniqueArray([
      body.image,
      ...(body.images || []),
    ]);
  } else if (body.images && body.images.length) {
    body.image = body.images[0];
  }

  /* -------------------------------------------------------
     Slug validation
  ------------------------------------------------------- */

  validateProductSlug(
    body.slug
  );

  /* -------------------------------------------------------
     Create
  ------------------------------------------------------- */

  const product =
    await Product.create(body);

  res.status(201).json({
    success: true,
    message:
      "Product created successfully.",
    product:
      serializeProduct(product),
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
    throw new ApiError(
      400,
      "Product identifier is required."
    );
  }

  const product =
    await findProductByIdentifier(
      identifier
    );

  if (!product) {
    throw new ApiError(
      404,
      "Product not found."
    );
  }

  const body =
    normalizeProductBody(
      req.body
    );

  /* -------------------------------------------------------
     Uploaded images
  ------------------------------------------------------- */

  const uploadedImages =
    getUploadedImages(req);

  if (uploadedImages.length) {
    const uploadedImagePaths =
      uploadedImages.map(
        (file) =>
          `/uploads/products/${file.filename}`
      );

    body.images =
      uniqueArray([
        ...(body.images ||
          getProductImages(product)),
        ...uploadedImagePaths,
      ]);

    if (!body.image) {
      body.image =
        body.images[0];
    }
  }

  /* -------------------------------------------------------
     Legacy image
  ------------------------------------------------------- */

  const legacyImage =
    getLegacyImage(req);

  if (legacyImage) {
    const legacyPath =
      `/uploads/products/${legacyImage.filename}`;

    body.image = legacyPath;

    body.images =
      uniqueArray([
        ...(body.images ||
          getProductImages(product)),
        legacyPath,
      ]);
  }

  /* -------------------------------------------------------
     Uploaded videos
  ------------------------------------------------------- */

  const uploadedVideos =
    getUploadedVideos(req);

  if (uploadedVideos.length) {
    const uploadedVideoPaths =
      uploadedVideos.map(
        (file) =>
          `/uploads/products/${file.filename}`
      );

    body.videos =
      uniqueArray([
        ...(body.videos ||
          getProductVideos(product)),
        ...uploadedVideoPaths,
      ]);
  }

  /* -------------------------------------------------------
     Keep `image` (main image) in sync with `images`

     The admin form sends the images that should remain
     (existingImages) plus any new uploads. The main image is
     always the first one, so removing/reordering images in the
     form must also update `image`, otherwise the product card
     keeps pointing at a removed or stale file.
  ------------------------------------------------------- */

  if (body.images !== undefined) {
    body.image = body.images[0] || null;
  } else if (body.image) {
    body.images = uniqueArray([
      body.image,
      ...getProductImages(product),
    ]);
  }

  /* -------------------------------------------------------
     Slug validation
  ------------------------------------------------------- */

  validateProductSlug(
    body.slug
  );

  /* -------------------------------------------------------
     Update
  ------------------------------------------------------- */

  Object.keys(body).forEach(
    (key) => {
      if (
        body[key] !== undefined
      ) {
        product[key] =
          body[key];
      }
    }
  );

  await product.save();

  res.json({
    success: true,
    message:
      "Product updated successfully.",
    product:
      serializeProduct(product),
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
    throw new ApiError(
      400,
      "Product identifier is required."
    );
  }

  const product =
    await findProductByIdentifier(
      identifier
    );

  if (!product) {
    throw new ApiError(
      404,
      "Product not found."
    );
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
            product:
              product._id,
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
          products:
            product._id,
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
      product:
        product._id,
    });
  } catch (_) {
    // Review cleanup should not prevent successful deletion.
  }

  res.json({
    success: true,
    message:
      "Product deleted successfully.",
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