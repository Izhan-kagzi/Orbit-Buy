const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const ActivityLog = require("../models/ActivityLog");

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

  const user = await User.findById(decoded.id).lean();

  if (!user) {
    throw new ApiError(401, "User no longer exists.");
  }

  req.user = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role || "customer",
  };
  req.sessionId = decoded.sessionId || user.currentSessionId || null;

  // Record manager activity centrally. This covers manager actions across
  // products, orders, reviews, flash sales, etc., without changing every controller.
  if (req.user.role === "manager" && req.sessionId) {
    const now = new Date();
    await Promise.all([
      ActivityLog.create({
        user: user._id,
        sessionId: req.sessionId,
        type: "activity",
        method: req.method,
        path: req.originalUrl,
        action: `${req.method} ${req.originalUrl}`,
        ip: req.ip,
        userAgent: req.get("user-agent") || null,
      }),
      User.updateOne(
        { _id: user._id, currentSessionId: req.sessionId },
        { $set: { lastSeenAt: now } }
      ),
    ]);
  }

  next();
});

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    throw new ApiError(403, "Admin access required.");
  }
  next();
};

// Allows both admins and managers — used for order/cancellation
// management, product edits, flash sales and review moderation, which
// managers handle without needing full admin access to coupons or
// manager accounts themselves.
const staffOnly = (req, res, next) => {
  if (!req.user || !["admin", "manager"].includes(req.user.role)) {
    throw new ApiError(403, "Staff access required.");
  }
  next();
};

// Attaches req.user when a valid token is present, but never rejects —
// used by public endpoints that show extra data to signed-in staff.
const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) return next();

  try {
    const decoded = verifyToken(authHeader.split(" ")[1]);
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
    // Ignore — the route is public.
  }

  next();
});

module.exports = { protect, adminOnly, staffOnly, optionalAuth };
