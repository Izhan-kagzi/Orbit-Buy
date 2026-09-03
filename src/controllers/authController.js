const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { readDB, writeDB } = require("../config/db");
const { signToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

// @route POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password, mobile } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email and password are required.");
  }

  if (!EMAIL_RE.test(email)) {
    throw new ApiError(400, "Please enter a valid email address.");
  }

  if (password.length < 6) {
    throw new ApiError(
      400,
      "Password must be at least 6 characters long."
    );
  }

  const db = readDB();

  const existing = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );

  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    mobile: mobile || "",
    role: "customer",
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  db.carts[newUser.id] = [];
  db.wishlists[newUser.id] = [];
  writeDB(db);

  const token = signToken({ id: newUser.id });

  res.status(201).json({
    success: true,
    token,
    user: sanitizeUser(newUser),
  });
});

// @route POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const db = readDB();

  const user = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const token = signToken({ id: user.id });

  res.json({
    success: true,
    token,
    user: sanitizeUser(user),
  });
});

// @route GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  res.json({ success: true, user: sanitizeUser(user) });
});

// @route PUT /api/auth/me
const updateMe = asyncHandler(async (req, res) => {
  const { name, mobile } = req.body;

  const db = readDB();
  const user = db.users.find((u) => u.id === req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (name) user.name = name;
  if (mobile !== undefined) user.mobile = mobile;

  writeDB(db);

  res.json({ success: true, user: sanitizeUser(user) });
});

module.exports = { register, login, getMe, updateMe };
