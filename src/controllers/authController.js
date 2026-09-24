const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");
const { signToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const ActivityLog = require("../models/ActivityLog");
const crypto = require("crypto");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @route POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password, mobile } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email and password are required.");
  }

  if (!EMAIL_RE.test(email)) {
    throw new ApiError(400, "Please enter a valid email address.");
  }

  if (String(password).length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters long.");
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: hashedPassword,
    mobile: mobile || "",
    role: "customer",
  });

  // Give every new account an empty cart and wishlist up front.
  await Promise.all([
    Cart.create({ user: user._id, items: [] }),
    Wishlist.create({ user: user._id, products: [] }),
  ]);

  const token = signToken({ id: user._id });

  res.status(201).json({
    success: true,
    token,
    user: user.toJSON(),
  });
});

// @route POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  // password has select:false on the schema, so ask for it explicitly.
  const user = await User.findOne({
    email: String(email).toLowerCase().trim(),
  }).select("+password");

  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const sessionId = user.role === "manager" ? crypto.randomUUID() : null;
  const token = signToken({ id: user._id, sessionId });

  // Each login creates a session record so admins can see historical
  // login/logout times even after the manager has logged out.
  const now = new Date();

  if (user.role === "manager") {
    user.currentSessionId = sessionId;
    user.currentLoginAt = now;
    user.lastSeenAt = now;
    user.lastLogoutAt = null;
    await user.save();

    await ActivityLog.create({
      user: user._id,
      sessionId,
      type: "login",
      action: "Manager logged in",
      ip: req.ip,
      userAgent: req.get("user-agent") || null,
    });
  }

  res.json({
    success: true,
    token,
    user: user.toJSON(),
  });
});

// @route POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user?.role === "manager") {
    const sessionId = req.sessionId || user.currentSessionId || crypto.randomUUID();
    const now = new Date();

    await ActivityLog.create({
      user: user._id,
      sessionId,
      type: "logout",
      action: "Manager logged out",
      ip: req.ip,
      userAgent: req.get("user-agent") || null,
    });

    user.lastLogoutAt = now;
    if (user.currentSessionId === sessionId) {
      user.lastSeenAt = now;
      user.currentSessionId = null;
      user.currentLoginAt = null;
    }
    await user.save();
  }

  res.json({ success: true, message: "Logged out successfully." });
});

// @route POST /api/auth/heartbeat
const heartbeat = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user?.role === "manager" && req.sessionId) {
    if (user.currentSessionId === req.sessionId) {
      user.lastSeenAt = new Date();
      await user.save();
    }
  }

  res.json({ success: true });
});

// @route GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  res.json({ success: true, user: user.toJSON() });
});

// @route PUT /api/auth/me
const updateMe = asyncHandler(async (req, res) => {
  const { name, mobile } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (name !== undefined && String(name).trim()) {
    user.name = String(name).trim();
  }

  if (mobile !== undefined) {
    user.mobile = String(mobile).trim();
  }

  await user.save();

  res.json({ success: true, user: user.toJSON() });
});

// @route PUT /api/auth/password  { currentPassword, newPassword }
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current and new password are required.");
  }

  if (String(newPassword).length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters long.");
  }

  const user = await User.findById(req.user.id).select("+password");

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);

  if (!isMatch) {
    throw new ApiError(401, "Your current password is incorrect.");
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ success: true, message: "Password updated successfully." });
});

module.exports = { register, login, logout, heartbeat, getMe, updateMe, changePassword };
