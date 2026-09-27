const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const ManagerActivity = require("../models/ManagerActivity");

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  // No Authorization header
  if (!authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authorized. Please log in.");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    throw new ApiError(401, "Not authorized. Please log in.");
  }

  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (error) {
    // IMPORTANT:
    // Log only the JWT error type/message.
    // Never log the token or JWT_SECRET.
    console.error(
      "[auth] JWT verification failed:",
      error.name,
      error.message
    );

    throw new ApiError(401, "Session expired. Please log in again.");
  }

  // Make sure the JWT contains a user ID
  if (!decoded || !decoded.id) {
    console.error("[auth] JWT verification succeeded but no user ID was found.");

    throw new ApiError(401, "Invalid authentication token.");
  }

  // Find the user associated with the token
  const user = await User.findById(decoded.id).lean();

  if (!user) {
    throw new ApiError(401, "User no longer exists.");
  }

  // Attach authenticated user to request
  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role || "customer",
  };

  // ---------------------------------------------------------
  // MANAGER ACTIVITY TRACKING
  // ---------------------------------------------------------
  // Track manager API activity without delaying the response.
  // The response status is captured when Express finishes.
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
// Allows:
// - admin
// - manager
//
// Used for:
// - order management
// - cancellation management
// - product management
// - flash sales
// - review moderation
//
// Managers do NOT automatically get admin-only functionality.
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
// Used by public routes where authentication is optional.
//
// If the token is valid:
//   req.user is attached.
//
// If the token is missing/invalid/expired:
//   request continues normally.
// ---------------------------------------------------------

const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  // No token — continue as public request
  if (!authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return next();
    }

    const user = await User.findById(decoded.id).lean();

    if (user) {
      req.user = {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role || "customer",
      };
    }
  } catch (error) {
    // Ignore invalid/expired tokens because this route is public.
    // Do NOT expose token or secret in logs.
  }

  next();
});

module.exports = {
  protect,
  adminOnly,
  staffOnly,
  optionalAuth,
};