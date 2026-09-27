const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");

const { signToken } = require("../utils/jwt");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const ManagerActivity = require("../models/ManagerActivity");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =========================================================
// REGISTER
// POST /api/auth/register
// =========================================================

const register = asyncHandler(async (req, res) => {
  const { name, email, password, mobile } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(
      400,
      "Name, email and password are required."
    );
  }

  if (!EMAIL_RE.test(email)) {
    throw new ApiError(
      400,
      "Please enter a valid email address."
    );
  }

  if (String(password).length < 6) {
    throw new ApiError(
      400,
      "Password must be at least 6 characters long."
    );
  }

  const normalizedEmail = String(email)
    .toLowerCase()
    .trim();

  const existing = await User.findOne({
    email: normalizedEmail,
  }).lean();

  if (existing) {
    throw new ApiError(
      409,
      "An account with this email already exists."
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: hashedPassword,
    mobile: mobile || "",
    role: "customer",
  });

  // Create empty cart and wishlist.
  await Promise.all([
    Cart.create({
      user: user._id,
      items: [],
    }),

    Wishlist.create({
      user: user._id,
      products: [],
    }),
  ]);

  const token = signToken({
    id: String(user._id),
  });

  res.status(201).json({
    success: true,
    token,
    user: user.toJSON(),
  });
});

// =========================================================
// LOGIN
// POST /api/auth/login
// =========================================================

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(
      400,
      "Email and password are required."
    );
  }

  const normalizedEmail = String(email)
    .toLowerCase()
    .trim();

  // Password has select:false in User schema.
  // Explicitly select it for login.
  const user = await User.findOne({
    email: normalizedEmail,
  }).select("+password");

  if (!user) {
    throw new ApiError(
      401,
      "Invalid email or password."
    );
  }

  const isMatch = await bcrypt.compare(
    password,
    user.password
  );

  if (!isMatch) {
    throw new ApiError(
      401,
      "Invalid email or password."
    );
  }

  // IMPORTANT:
  // User IDs are strings in this application.
  const userId = String(user._id);

  const token = signToken({
    id: userId,
  });

  // Safe debugging.
  // Does NOT log password or JWT.
  console.log("[auth] Login successful:", {
    id: userId,
    email: user.email,
    role: user.role,
  });

  // -------------------------------------------------------
  // MANAGER LOGIN ACTIVITY
  // -------------------------------------------------------

  if (user.role === "manager") {
    ManagerActivity.create({
      managerId: userId,
      type: "login",
      action: "Manager logged in",
      method: req.method,
      path: req.originalUrl,
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
    }).catch((error) => {
      console.error(
        "[manager-activity] login log failed:",
        error.message
      );
    });
  }

  res.json({
    success: true,
    token,
    user: user.toJSON(),
  });
});

// =========================================================
// LOGOUT
// POST /api/auth/logout
// =========================================================

const logout = asyncHandler(async (req, res) => {
  if (req.user && req.user.role === "manager") {
    await ManagerActivity.create({
      managerId: req.user.id,
      type: "logout",
      action: "Manager logged out",
      method: req.method,
      path: req.originalUrl,
      ip: req.ip || "",
      userAgent: req.get("user-agent") || "",
    });
  }

  res.json({
    success: true,
    message: "Logged out successfully.",
  });
});

// =========================================================
// GET CURRENT USER
// GET /api/auth/me
// =========================================================

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(
    String(req.user.id)
  );

  if (!user) {
    throw new ApiError(
      404,
      "User not found."
    );
  }

  res.json({
    success: true,
    user: user.toJSON(),
  });
});

// =========================================================
// UPDATE CURRENT USER
// PUT /api/auth/me
// =========================================================

const updateMe = asyncHandler(async (req, res) => {
  const { name, mobile } = req.body;

  const user = await User.findById(
    String(req.user.id)
  );

  if (!user) {
    throw new ApiError(
      404,
      "User not found."
    );
  }

  if (
    name !== undefined &&
    String(name).trim()
  ) {
    user.name = String(name).trim();
  }

  if (mobile !== undefined) {
    user.mobile = String(mobile).trim();
  }

  await user.save();

  res.json({
    success: true,
    user: user.toJSON(),
  });
});

// =========================================================
// CHANGE PASSWORD
// PUT /api/auth/password
// =========================================================

const changePassword = asyncHandler(async (req, res) => {
  const {
    currentPassword,
    newPassword,
  } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(
      400,
      "Current and new password are required."
    );
  }

  if (String(newPassword).length < 6) {
    throw new ApiError(
      400,
      "New password must be at least 6 characters long."
    );
  }

  const user = await User.findById(
    String(req.user.id)
  ).select("+password");

  if (!user) {
    throw new ApiError(
      404,
      "User not found."
    );
  }

  const isMatch = await bcrypt.compare(
    currentPassword,
    user.password
  );

  if (!isMatch) {
    throw new ApiError(
      401,
      "Your current password is incorrect."
    );
  }

  user.password = await bcrypt.hash(
    newPassword,
    10
  );

  await user.save();

  res.json({
    success: true,
    message: "Password updated successfully.",
  });
});

module.exports = {
  register,
  login,
  logout,
  getMe,
  updateMe,
  changePassword,
};