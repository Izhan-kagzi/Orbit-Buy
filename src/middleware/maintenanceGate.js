const Settings = require("../models/Settings");
const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");

const SETTINGS_KEY = "maintenance";

// Always reachable, maintenance or not — health checks, the maintenance
// status itself, and the auth endpoints an admin/manager needs to sign in
// and sign out.
const ALWAYS_ALLOWED = new Set([
  "/api/health",
  "/api/settings/maintenance",
  "/api/auth/login",
  "/api/auth/me",
  "/api/auth/logout",
]);

function isActive(m) {
  if (!m?.enabled) return false;

  const now = Date.now();

  if (m.startTime && now < new Date(m.startTime).getTime()) return false;
  if (m.endTime && now >= new Date(m.endTime).getTime()) return false;

  return true;
}

/**
 * Blocks customer-facing API traffic while maintenance mode is on. Staff
 * (admin/manager) are always let through so they can keep working and so
 * an admin can turn maintenance back off. A check failure never takes the
 * whole site down — it just falls through and lets the request proceed.
 */
async function maintenanceGate(req, res, next) {
  try {
    if (ALWAYS_ALLOWED.has(req.path)) return next();

    const doc = await Settings.findOne({ key: SETTINGS_KEY }).lean();

    if (!isActive(doc?.maintenance)) return next();

    const authHeader = req.headers.authorization || "";

    if (authHeader.startsWith("Bearer ")) {
      try {
        const decoded = verifyToken(authHeader.split(" ")[1]);
        const user = await User.findById(decoded.id).lean();

        if (user && ["admin", "manager"].includes(user.role)) {
          return next();
        }
      } catch {
        // Invalid/expired token — fall through to the blocked response
        // below rather than letting protect() throw its own 401.
      }
    }

    return res.status(503).json({
      success: false,
      message:
        doc.maintenance.message ||
        "Orbit Buy is undergoing scheduled maintenance. Please check back soon.",
      maintenance: {
        active: true,
        startTime: doc.maintenance.startTime || null,
        endTime: doc.maintenance.endTime || null,
      },
    });
  } catch (error) {
    next();
  }
}

module.exports = maintenanceGate;