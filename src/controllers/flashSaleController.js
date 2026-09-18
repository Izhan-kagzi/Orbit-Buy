const FlashSale = require("../models/FlashSale");
const Product = require("../models/Product");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Flash sales.
 *
 * Previously there was a single flash-sale blob that could only be
 * edited or wiped. It is now a real collection: an admin or a manager
 * can ADD any number of sales, each with its own start and end
 * date/time, EDIT them, and DELETE any single one.
 */

/* ============================================================
   HELPERS
============================================================ */

const normalizeImages = (images) => {
  if (!Array.isArray(images)) return [];

  return [
    ...new Set(
      images
        .filter((image) => typeof image === "string")
        .map((image) => image.trim())
        .filter(Boolean)
    ),
  ];
};

/* Images newly uploaded through multer on this request. */
const getUploadedImages = (req) => {
  if (!req.files || !Array.isArray(req.files)) return [];

  return req.files.map((file) => `/uploads/custom/${file.filename}`);
};

/* FormData sends arrays as JSON strings or comma-separated values. */
const parseImageList = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (Array.isArray(value)) return normalizeImages(value);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeImages(parsed);
      return normalizeImages([String(parsed)]);
    } catch (error) {
      return normalizeImages(value.split(","));
    }
  }

  throw new ApiError(400, "Invalid images value.");
};

/**
 * Accepts anything a datetime-local input or a JSON client sends:
 * "2026-09-20T18:30", an ISO string, or a timestamp.
 */
const parseDateTime = (value, label) => {
  if (value === undefined || value === null || value === "") return null;

  const parsed = new Date(
    typeof value === "number" || /^\d+$/.test(String(value))
      ? Number(value)
      : value
  );

  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `Invalid Flash Sale ${label} date/time.`);
  }

  return parsed;
};

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
};

const parseProducts = (value) => {
  if (value === undefined || value === null || value === "") return null;

  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (error) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return null;
};

const staffStamp = (req) =>
  req.user
    ? { id: req.user.id, name: req.user.name, role: req.user.role }
    : { id: null, name: null, role: null };

/**
 * Serialises a sale with its computed status. Status is derived from
 * the clock on every read, so a sale automatically flips from
 * "upcoming" to "active" to "ended" without any cron job.
 */
const serialize = (sale) => {
  const json = sale.toJSON();
  return {
    ...json,
    status: sale.status,
    isRunning: sale.isRunning,
  };
};

/* ============================================================
   LIST FLASH SALES
   GET /api/flash-sale          -> currently running sale (legacy shape)
   GET /api/flash-sale/all      -> every sale
   PUBLIC (list is public; ?all=true needs no auth but is harmless)
============================================================ */

const getFlashSales = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const sales = await FlashSale.find().sort({ startTime: -1 });

  let result = sales.map(serialize);

  if (status) {
    result = result.filter((sale) => sale.status === status);
  }

  res.json({
    success: true,
    count: result.length,
    flashSales: result,
    // Alias kept so older frontend code reading `sales` still works.
    sales: result,
  });
});

/* ============================================================
   GET THE ACTIVE FLASH SALE
   GET /api/flash-sale
   PUBLIC
   Returns the sale that is running right now (or the next upcoming
   one), in the single-object shape the storefront banner expects.
============================================================ */

const getActiveFlashSale = asyncHandler(async (req, res) => {
  const now = new Date();

  const running = await FlashSale.findOne({
    active: true,
    startTime: { $lte: now },
    endTime: { $gt: now },
  }).sort({ endTime: 1 });

  const upcoming = running
    ? null
    : await FlashSale.findOne({
        active: true,
        startTime: { $gt: now },
      }).sort({ startTime: 1 });

  const sale = running || upcoming;

  res.json({
    success: true,
    flashSale: sale ? serialize(sale) : null,
  });
});

/* ============================================================
   GET ONE FLASH SALE
   GET /api/flash-sale/:id
   PUBLIC
============================================================ */

const getFlashSaleById = asyncHandler(async (req, res) => {
  const sale = await FlashSale.findById(req.params.id);

  if (!sale) {
    throw new ApiError(404, "Flash Sale not found.");
  }

  res.json({ success: true, flashSale: serialize(sale) });
});

/* ============================================================
   ADD A FLASH SALE
   POST /api/flash-sale
   ADMIN + MANAGER
============================================================ */

const createFlashSale = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    startTime,
    startDate,
    endTime,
    endDate,
    active,
    discountPercent,
    products,
  } = req.body || {};

  if (!title || !String(title).trim()) {
    throw new ApiError(400, "Flash Sale title is required.");
  }

  // `startDate`/`endDate` are accepted as aliases so a form with
  // separate date and time inputs can send either name.
  const start = parseDateTime(startTime ?? startDate, "start");
  const end = parseDateTime(endTime ?? endDate, "end");

  if (!start) {
    throw new ApiError(400, "Flash Sale start date/time is required.");
  }

  if (!end) {
    throw new ApiError(400, "Flash Sale end date/time is required.");
  }

  if (end <= start) {
    throw new ApiError(
      400,
      "Flash Sale end time must be after the start time."
    );
  }

  const images = normalizeImages([
    ...(parseImageList(req.body.images) || []),
    ...getUploadedImages(req),
  ]);

  const productIds = parseProducts(products) || [];

  if (productIds.length > 0) {
    const found = await Product.countDocuments({ _id: { $in: productIds } });
    if (found !== productIds.length) {
      throw new ApiError(400, "One or more selected products don't exist.");
    }
  }

  const percent =
    discountPercent === undefined || discountPercent === ""
      ? null
      : Number(discountPercent);

  if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
    throw new ApiError(400, "discountPercent must be between 0 and 100.");
  }

  const sale = await FlashSale.create({
    title: String(title).trim(),
    description: description ? String(description).trim() : "",
    images,
    discountPercent: percent,
    products: productIds,
    startTime: start,
    endTime: end,
    active: parseBool(active, true),
    createdBy: staffStamp(req),
    updatedBy: staffStamp(req),
  });

  res.status(201).json({
    success: true,
    message: "Flash Sale created successfully.",
    flashSale: serialize(sale),
  });
});

/* ============================================================
   UPDATE A FLASH SALE
   PUT /api/flash-sale/:id
   ADMIN + MANAGER
============================================================ */

const updateFlashSale = asyncHandler(async (req, res) => {
  const sale = await FlashSale.findById(req.params.id);

  if (!sale) {
    throw new ApiError(404, "Flash Sale not found.");
  }

  const {
    title,
    description,
    startTime,
    startDate,
    endTime,
    endDate,
    active,
    discountPercent,
    products,
    existingImages,
  } = req.body || {};

  if (title !== undefined) {
    if (!String(title).trim()) {
      throw new ApiError(400, "Flash Sale title can't be empty.");
    }
    sale.title = String(title).trim();
  }

  if (description !== undefined) {
    sale.description = String(description).trim();
  }

  const rawStart = startTime ?? startDate;
  const rawEnd = endTime ?? endDate;

  if (rawStart !== undefined) {
    const parsed = parseDateTime(rawStart, "start");
    if (!parsed) throw new ApiError(400, "Flash Sale start date/time is required.");
    sale.startTime = parsed;
  }

  if (rawEnd !== undefined) {
    const parsed = parseDateTime(rawEnd, "end");
    if (!parsed) throw new ApiError(400, "Flash Sale end date/time is required.");
    sale.endTime = parsed;
  }

  if (sale.endTime <= sale.startTime) {
    throw new ApiError(
      400,
      "Flash Sale end time must be after the start time."
    );
  }

  if (discountPercent !== undefined) {
    if (discountPercent === "" || discountPercent === null) {
      sale.discountPercent = null;
    } else {
      const percent = Number(discountPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new ApiError(400, "discountPercent must be between 0 and 100.");
      }
      sale.discountPercent = percent;
    }
  }

  if (products !== undefined) {
    const productIds = parseProducts(products) || [];

    if (productIds.length > 0) {
      const found = await Product.countDocuments({ _id: { $in: productIds } });
      if (found !== productIds.length) {
        throw new ApiError(400, "One or more selected products don't exist.");
      }
    }

    sale.products = productIds;
  }

  /* Images: keep whatever the client says to keep, then append uploads. */
  let retained = sale.images;

  const keepList = parseImageList(existingImages ?? req.body.images);
  if (keepList !== null) retained = keepList;

  sale.images = normalizeImages([...retained, ...getUploadedImages(req)]);

  if (active !== undefined) {
    sale.active = parseBool(active, sale.active);
  }

  sale.updatedBy = staffStamp(req);

  await sale.save();

  res.json({
    success: true,
    message: "Flash Sale updated successfully.",
    flashSale: serialize(sale),
  });
});

/* ============================================================
   DELETE A FLASH SALE
   DELETE /api/flash-sale/:id
   ADMIN + MANAGER
============================================================ */

const deleteFlashSale = asyncHandler(async (req, res) => {
  const sale = await FlashSale.findById(req.params.id);

  if (!sale) {
    throw new ApiError(404, "Flash Sale not found.");
  }

  await FlashSale.deleteOne({ _id: sale._id });

  res.json({
    success: true,
    message: "Flash Sale deleted successfully.",
    id: String(sale._id),
  });
});

/* ============================================================
   DELETE EVERY FLASH SALE
   DELETE /api/flash-sale
   ADMIN + MANAGER
   (Kept so the old "reset flash sale" button keeps working.)
============================================================ */

const deleteAllFlashSales = asyncHandler(async (req, res) => {
  const { deletedCount } = await FlashSale.deleteMany({});

  res.json({
    success: true,
    message: `Removed ${deletedCount} flash sale${deletedCount === 1 ? "" : "s"}.`,
    deletedCount,
    flashSale: null,
  });
});

module.exports = {
  getFlashSales,
  getActiveFlashSale,
  getFlashSaleById,
  createFlashSale,
  updateFlashSale,
  deleteFlashSale,
  deleteAllFlashSales,
};
