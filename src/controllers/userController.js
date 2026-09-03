const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { readDB, writeDB } = require("../config/db");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

// @route GET /api/users  (admin only) — everyone, for the admin to
// browse and decide who to promote/demote.
const getAllUsers = asyncHandler(async (req, res) => {
  const db = readDB();
  const users = db.users.map(sanitizeUser);
  res.json({ success: true, count: users.length, users });
});

// @route GET /api/users/managers  (admin only)
const getManagers = asyncHandler(async (req, res) => {
  const db = readDB();
  const managers = db.users.filter((u) => u.role === "manager").map(sanitizeUser);
  res.json({ success: true, count: managers.length, managers });
});

// @route PUT /api/users/:id/role  (admin only)  { role: "manager" | "customer" }
// Deliberately does NOT accept "admin" here — promoting someone to
// full admin isn't something this endpoint should allow, to avoid
// accidental privilege escalation through the manager-management UI.
const setUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  if (!["manager", "customer"].includes(role)) {
    throw new ApiError(400, 'role must be "manager" or "customer".');
  }

  const db = readDB();
  const user = db.users.find((u) => u.id === req.params.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new ApiError(403, "Admin accounts can't be modified here.");
  }

  if (user.id === req.user.id) {
    throw new ApiError(400, "You can't change your own role.");
  }

  user.role = role;
  writeDB(db);

  res.json({ success: true, user: sanitizeUser(user) });
});

// @route POST /api/users/managers  (admin only)  { name, email, password }
// Creates a brand-new manager account directly, instead of promoting
// an existing customer.
const createManager = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email and password are required.");
  }

  if (!EMAIL_RE.test(email)) {
    throw new ApiError(400, "Please enter a valid email address.");
  }

  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters long.");
  }

  const db = readDB();

  const existing = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newManager = {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    mobile: "",
    role: "manager",
    createdAt: new Date().toISOString(),
  };

  db.users.push(newManager);
  db.carts[newManager.id] = [];
  db.wishlists[newManager.id] = [];
  writeDB(db);

  res.status(201).json({ success: true, user: sanitizeUser(newManager) });
});

// @route DELETE /api/users/:id  (admin only)
// Permanently deletes a manager (or customer) account. Admin accounts
// and the caller's own account can't be deleted here.
const deleteUser = asyncHandler(async (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.params.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new ApiError(403, "Admin accounts can't be deleted here.");
  }

  if (user.id === req.user.id) {
    throw new ApiError(400, "You can't delete your own account.");
  }

  db.users = db.users.filter((u) => u.id !== req.params.id);
  delete db.carts[req.params.id];
  delete db.wishlists[req.params.id];
  writeDB(db);

  res.json({ success: true, message: "User deleted." });
});

module.exports = {
  getAllUsers,
  getManagers,
  setUserRole,
  createManager,
  deleteUser,
};
