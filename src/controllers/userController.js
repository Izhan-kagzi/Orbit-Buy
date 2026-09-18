const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");
const Review = require("../models/Review");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @route GET /api/users  (admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });

  res.json({
    success: true,
    count: users.length,
    users: users.map((u) => u.toJSON()),
  });
});

// @route GET /api/users/managers  (admin only)
const getManagers = asyncHandler(async (req, res) => {
  const managers = await User.find({ role: "manager" }).sort({ createdAt: -1 });

  res.json({
    success: true,
    count: managers.length,
    managers: managers.map((u) => u.toJSON()),
  });
});

// @route PUT /api/users/:id/role  (admin only)  { role: "manager" | "customer" }
// Deliberately does NOT accept "admin" — promoting someone to full
// admin isn't something this endpoint should allow.
const setUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  if (!["manager", "customer"].includes(role)) {
    throw new ApiError(400, 'role must be "manager" or "customer".');
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new ApiError(403, "Admin accounts can't be modified here.");
  }

  if (String(user._id) === req.user.id) {
    throw new ApiError(400, "You can't change your own role.");
  }

  user.role = role;
  await user.save();

  res.json({ success: true, user: user.toJSON() });
});

// @route POST /api/users/managers  (admin only)  { name, email, password }
const createManager = asyncHandler(async (req, res) => {
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

  const manager = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, 10),
    mobile: mobile || "",
    role: "manager",
  });

  await Promise.all([
    Cart.create({ user: manager._id, items: [] }),
    Wishlist.create({ user: manager._id, products: [] }),
  ]);

  res.status(201).json({ success: true, user: manager.toJSON() });
});

// @route DELETE /api/users/:id  (admin only)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new ApiError(403, "Admin accounts can't be deleted here.");
  }

  if (String(user._id) === req.user.id) {
    throw new ApiError(400, "You can't delete your own account.");
  }

  // Clean up everything that belonged to the account. Orders are kept
  // on purpose — they're financial records.
  await Promise.all([
    User.deleteOne({ _id: user._id }),
    Cart.deleteOne({ user: user._id }),
    Wishlist.deleteOne({ user: user._id }),
    Review.deleteMany({ userId: user._id }),
  ]);

  res.json({ success: true, message: "User deleted." });
});

module.exports = {
  getAllUsers,
  getManagers,
  setUserRole,
  createManager,
  deleteUser,
};
