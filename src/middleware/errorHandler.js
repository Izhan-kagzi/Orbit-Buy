const ApiError = require("../utils/ApiError");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode =
    err instanceof ApiError
      ? err.statusCode
      : err.statusCode || 500;

  console.error(err);

  res.status(statusCode).json({
    success: false,
    message:
      err.message || "Something went wrong on the server.",
  });
}

function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFound };
