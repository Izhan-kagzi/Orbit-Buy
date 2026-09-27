const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const ManagerActivity = require("../models/ManagerActivity");

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  // ---------------------------------------------------------
  // CHECK AUTHORIZATION HEADER
  // ---------------------------------------------------------

  if (!authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authorized. Please log in.");
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    throw new ApiError(401, "Not authorized. Please log in.");
  }

  // ---------------------------------------------------------
  // VERIFY JWT
  // ---------------------------------------------------------

  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (error) {
    // Safe debugging.
    // NEVER log the JWT token or JWT secret.
    console.error(
      "[auth] JWT verification failed:",
      error.name,
      error.message
    );

    throw new ApiError(401, "Session expired. Please log in again.");
  }

  // ---------------------------------------------------------
  // CHECK JWT USER ID
  // ---------------------------------------------------------

  if (!decoded || !decoded.id) {
    console.error("[auth] JWT does not contain a user id.");

    throw new ApiError(401, "Invalid authentication token.");
  }

  const userId = String(decoded.id);

  // ---------------------------------------------------------
  // FIND USER
  // ---------------------------------------------------------

  let user;

  try {
    user = await User.findById(userId).lean();
  } catch (error) {
    console.error(
      "[auth] User lookup failed:",
      error.name,
      error.message
    );

    throw new ApiError(401, "Invalid authentication token.");
  }

  if (!user) {
    console.error(
      "[auth] USER LOOKUP FAILED:",
      JSON.stringify({
        decodedId: userId,
        decodedIdType: typeof decoded.id,
      })
    );

    throw new ApiError(401, "User no longer exists.");
  }

  // ---------------------------------------------------------
  // ATTACH USER TO REQUEST
  // ---------------------------------------------------------

  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role || "customer",
  };

  // ---------------------------------------------------------
  // MANAGER ACTIVITY TRACKING
  // ---------------------------------------------------------

  if (
    req.user.role === "manager" &&
    req.originalUrl !== "/api/auth/logout"
  ) {
    res.once("finish", () => {
      ManagerActivity.create({
        managerId: req.user.id,
        type: "request",
        action: `${req.method} ${req.path}`,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        ip: req.ip || "",
        userAgent: req.get("user-agent") || "",
      }).catch((error) => {
        console.error(
          "[manager-activity] request log failed:",
          error.message
        );
      });
    });
  }

  next();
});

// ---------------------------------------------------------
// ADMIN ONLY
// ---------------------------------------------------------

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    throw new ApiError(403, "Admin access required.");
  }

  next();
};

// ---------------------------------------------------------
// STAFF ONLY
// ---------------------------------------------------------
// Admin + Manager
// ---------------------------------------------------------

const staffOnly = (req, res, next) => {
  if (!req.user || !["admin", "manager"].includes(req.user.role)) {
    throw new ApiError(403, "Staff access required.");
  }

  next();
};

// ---------------------------------------------------------
// OPTIONAL AUTH
// ---------------------------------------------------------

const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return next();
    }

    const user = await User.findById(String(decoded.id)).lean();

    if (user) {
      req.user = {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role || "customer",
      };
    }
  } catch (error) {
    // Public endpoint:
    // invalid/expired authentication is ignored.
  }

  next();
});

module.exports = {
  protect,
  adminOnly,
  staffOnly,
  optionalAuth,
};