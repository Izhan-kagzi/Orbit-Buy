const jwt = require("jsonwebtoken");

// IMPORTANT:
// JWT_SECRET must be configured in Render.
// The fallback is only for local development.
const JWT_SECRET = process.env.JWT_SECRET || "orbit-buy-dev-secret";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

function signToken(payload) {
  if (!payload || !payload.id) {
    throw new Error("Cannot create JWT without a user id.");
  }

  return jwt.sign(
    {
      id: String(payload.id),
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    }
  );
}

function verifyToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("JWT token is missing or invalid.");
  }

  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signToken,
  verifyToken,
  JWT_SECRET,
  JWT_EXPIRES_IN,
};