const { verifyToken } = require("../utils/jwt");
const { readDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authorized. Please log in.");
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    throw new ApiError(401, "Session expired. Please log in again.");
  }

  const db = readDB();
  const user = db.users.find((u) => u.id === decoded.id);

  if (!user) {
    throw new ApiError(401, "User no longer exists.");
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "customer",
  };
  next();
});

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    throw new ApiError(403, "Admin access required.");
  }
  next();
};

// Allows both admins and managers — used for order/cancellation
// management, which managers can handle without needing full admin
// access to products, coupons, or manager accounts themselves.
const staffOnly = (req, res, next) => {
  if (!req.user || !["admin", "manager"].includes(req.user.role)) {
    throw new ApiError(403, "Staff access required.");
  }
  next();
};

module.exports = { protect, adminOnly, staffOnly };
