const multer = require("multer");
const ApiError = require("../utils/ApiError");

/**
 * Turns every failure — ApiError, Mongoose validation/cast errors,
 * duplicate keys, Multer upload errors — into the same JSON envelope
 * the frontend already expects: { success: false, message }.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  let message = err.message || "Something went wrong on the server.";
  let details;

  // ---- Mongoose: bad ObjectId / wrong id type -------------------
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for "${err.path}".`;
  }

  // ---- Mongoose: schema validation ------------------------------
  if (err.name === "ValidationError") {
    statusCode = 400;
    details = Object.values(err.errors).map((e) => e.message);
    message = details[0] || "Validation failed.";
  }

  // ---- Mongo: duplicate key -------------------------------------
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "value";
    message =
      field === "email"
        ? "An account with this email already exists."
        : field === "code"
        ? "A coupon with this code already exists."
        : field === "productId" || field === "userId"
        ? "You have already reviewed this product."
        : `Duplicate ${field}.`;
  }

  // ---- Mongo: server unreachable --------------------------------
  if (
    err.name === "MongooseServerSelectionError" ||
    err.name === "MongoNetworkError" ||
    err.name === "MongoNotConnectedError" ||
    /buffering timed out|Client must be connected|before initial connection/i.test(
      message
    )
  ) {
    statusCode = 503;
    message =
      "Database is unavailable right now. Make sure MongoDB is running and try again.";
  }

  // ---- Multer: upload problems ----------------------------------
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large. Maximum size is 100 MB."
        : err.code === "LIMIT_UNEXPECTED_FILE"
        ? `Unexpected file field "${err.field}".`
        : err.message;
  }

  if (err.code === "INVALID_FILE_TYPE") {
    statusCode = 400;
  }

  // ---- JWT ------------------------------------------------------
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Session expired. Please log in again.";
  }

  if (statusCode >= 500) {
    console.error("[error]", err);
  } else {
    console.warn(`[${statusCode}] ${req.method} ${req.originalUrl} — ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { errors: details } : {}),
  });
}

function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFound };
