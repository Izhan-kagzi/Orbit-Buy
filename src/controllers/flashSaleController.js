const { readDB, writeDB } = require("../config/db");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

const DEFAULT_FLASH_SALE = {
  title: "Flash Sale!",
  description: "Up to 30% off - Limited Time Offer!",
  images: [],
  startTime: null,
  endTime: null,
  active: false,
  updatedAt: null,
  updatedBy: null,
};

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

/* ------------------------------------------------------------
   Uploaded images
------------------------------------------------------------ */

const getUploadedImages = (req) => {
  if (!req.files || !Array.isArray(req.files)) {
    return [];
  }

  return req.files.map(
    (file) => `/uploads/custom/${file.filename}`
  );
};

/* ------------------------------------------------------------
   Get / initialize Flash Sale from DB
------------------------------------------------------------ */

const ensureFlashSale = (db) => {
  if (!db.flashSale || typeof db.flashSale !== "object") {
    db.flashSale = {
      ...DEFAULT_FLASH_SALE,
    };
  }

  db.flashSale = {
    ...DEFAULT_FLASH_SALE,
    ...db.flashSale,
    images: normalizeImages(db.flashSale.images),
  };

  return db.flashSale;
};

/* ============================================================
   GET FLASH SALE
   PUBLIC
============================================================ */

const getFlashSale = asyncHandler(async (req, res) => {
  const db = readDB();

  const flashSale = ensureFlashSale(db);

  const now = Date.now();

  const startTime = flashSale.startTime
    ? new Date(flashSale.startTime).getTime()
    : null;

  const endTime = flashSale.endTime
    ? new Date(flashSale.endTime).getTime()
    : null;

  let status = "inactive";

  if (flashSale.active) {
    if (startTime && now < startTime) {
      status = "upcoming";
    } else if (endTime && now >= endTime) {
      status = "ended";
    } else {
      status = "active";
    }
  }

  res.json({
    success: true,

    flashSale: {
      ...flashSale,
      status,
      isRunning: status === "active",
    },
  });
});

/* ============================================================
   UPDATE FLASH SALE
   ADMIN + MANAGER
============================================================ */

const updateFlashSale = asyncHandler(async (req, res) => {
  const db = readDB();

  const currentSale = ensureFlashSale(db);

  const {
    title,
    description,
    startTime,
    endTime,
    active,
    existingImages,
  } = req.body;

  /* ----------------------------------------------------------
     Validate start time
  ---------------------------------------------------------- */

  let normalizedStartTime = currentSale.startTime;
  let normalizedEndTime = currentSale.endTime;

  if (startTime !== undefined) {
    if (startTime === "" || startTime === null) {
      normalizedStartTime = null;
    } else {
      const parsedStart = new Date(startTime);

      if (Number.isNaN(parsedStart.getTime())) {
        throw new ApiError(
          400,
          "Invalid Flash Sale start date/time."
        );
      }

      normalizedStartTime = parsedStart.toISOString();
    }
  }

  /* ----------------------------------------------------------
     Validate end time
  ---------------------------------------------------------- */

  if (endTime !== undefined) {
    if (endTime === "" || endTime === null) {
      normalizedEndTime = null;
    } else {
      const parsedEnd = new Date(endTime);

      if (Number.isNaN(parsedEnd.getTime())) {
        throw new ApiError(
          400,
          "Invalid Flash Sale end date/time."
        );
      }

      normalizedEndTime = parsedEnd.toISOString();
    }
  }

  /* ----------------------------------------------------------
     Validate date order
  ---------------------------------------------------------- */

  if (normalizedStartTime && normalizedEndTime) {
    const start = new Date(normalizedStartTime).getTime();
    const end = new Date(normalizedEndTime).getTime();

    if (end <= start) {
      throw new ApiError(
        400,
        "Flash Sale end time must be after the start time."
      );
    }
  }

  /* ----------------------------------------------------------
     Existing images
  ---------------------------------------------------------- */

  let retainedImages = currentSale.images;

  if (existingImages !== undefined) {
    try {
      const parsed =
        typeof existingImages === "string"
          ? JSON.parse(existingImages)
          : existingImages;

      retainedImages = normalizeImages(parsed);
    } catch (error) {
      throw new ApiError(
        400,
        "Invalid existingImages data."
      );
    }
  }

  /* ----------------------------------------------------------
     Newly uploaded images
  ---------------------------------------------------------- */

  const uploadedImages = getUploadedImages(req);

  const finalImages = normalizeImages([
    ...retainedImages,
    ...uploadedImages,
  ]);

  /* ----------------------------------------------------------
     Active value
  ---------------------------------------------------------- */

  const normalizedActive =
    active !== undefined
      ? active === true ||
        active === "true" ||
        active === "1"
      : currentSale.active;

  /* ----------------------------------------------------------
     Update DB
  ---------------------------------------------------------- */

  const updatedSale = {
    ...currentSale,

    title:
      title !== undefined
        ? String(title).trim()
        : currentSale.title,

    description:
      description !== undefined
        ? String(description).trim()
        : currentSale.description,

    images: finalImages,

    startTime: normalizedStartTime,

    endTime: normalizedEndTime,

    active: normalizedActive,

    updatedAt: new Date().toISOString(),

    updatedBy: req.user
      ? {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role,
        }
      : null,
  };

  db.flashSale = updatedSale;

  writeDB(db);

  /* ----------------------------------------------------------
     Calculate current status for response
  ---------------------------------------------------------- */

  const now = Date.now();

  const startTimestamp = updatedSale.startTime
    ? new Date(updatedSale.startTime).getTime()
    : null;

  const endTimestamp = updatedSale.endTime
    ? new Date(updatedSale.endTime).getTime()
    : null;

  let status = "inactive";

  if (updatedSale.active) {
    if (
      startTimestamp &&
      now < startTimestamp
    ) {
      status = "upcoming";
    } else if (
      endTimestamp &&
      now >= endTimestamp
    ) {
      status = "ended";
    } else {
      status = "active";
    }
  }

  res.json({
    success: true,

    message: "Flash Sale updated successfully.",

    flashSale: {
      ...updatedSale,
      status,
      isRunning: status === "active",
    },
  });
});

/* ============================================================
   RESET FLASH SALE
   ADMIN + MANAGER
============================================================ */

const resetFlashSale = asyncHandler(async (req, res) => {
  const db = readDB();

  db.flashSale = {
    ...DEFAULT_FLASH_SALE,

    updatedAt: new Date().toISOString(),

    updatedBy: req.user
      ? {
          id: req.user.id,
          name: req.user.name,
          role: req.user.role,
        }
      : null,
  };

  writeDB(db);

  res.json({
    success: true,

    message: "Flash Sale reset successfully.",

    flashSale: {
      ...db.flashSale,
      status: "inactive",
      isRunning: false,
    },
  });
});

/* ============================================================
   EXPORTS
============================================================ */

module.exports = {
  getFlashSale,
  updateFlashSale,
  resetFlashSale,
};