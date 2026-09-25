const Settings = require("../models/Settings");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const SETTINGS_KEY = "maintenance";

async function getSettingsDoc() {
  let doc = await Settings.findOne({ key: SETTINGS_KEY });

  if (!doc) {
    doc = await Settings.create({ key: SETTINGS_KEY });
  }

  return doc;
}

// Maintenance is only actually "in effect" when the toggle is on AND we're
// inside whichever half of the window was set (both sides are optional).
function isActive(m) {
  if (!m?.enabled) return false;

  const now = Date.now();

  if (m.startTime && now < new Date(m.startTime).getTime()) return false;
  if (m.endTime && now >= new Date(m.endTime).getTime()) return false;

  return true;
}

function serialize(m) {
  return {
    enabled: Boolean(m?.enabled),
    active: isActive(m),
    startTime: m?.startTime || null,
    endTime: m?.endTime || null,
    message: m?.message || "",
  };
}

// @route GET /api/settings/maintenance (public)
const getMaintenanceStatus = asyncHandler(async (req, res) => {
  const doc = await getSettingsDoc();

  res.json({ success: true, maintenance: serialize(doc.maintenance) });
});

// @route PUT /api/settings/maintenance (admin only)
// body: { enabled?, startTime?, endTime?, message? }
const updateMaintenance = asyncHandler(async (req, res) => {
  const { enabled, startTime, endTime, message } = req.body;

  const doc = await getSettingsDoc();

  if (typeof enabled !== "undefined") {
    doc.maintenance.enabled = Boolean(enabled);
  }

  if (typeof message !== "undefined") {
    doc.maintenance.message = String(message || "").slice(0, 300);
  }

  if (typeof startTime !== "undefined") {
    doc.maintenance.startTime = startTime ? new Date(startTime) : null;
  }

  if (typeof endTime !== "undefined") {
    doc.maintenance.endTime = endTime ? new Date(endTime) : null;
  }

  if (
    doc.maintenance.startTime &&
    doc.maintenance.endTime &&
    doc.maintenance.endTime <= doc.maintenance.startTime
  ) {
    throw new ApiError(400, "Maintenance end time must be after the start time.");
  }

  doc.maintenance.updatedBy = { id: req.user.id, name: req.user.name };

  await doc.save();

  res.json({ success: true, maintenance: serialize(doc.maintenance) });
});

module.exports = { getMaintenanceStatus, updateMaintenance, isActive };