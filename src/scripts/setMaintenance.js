/**
 * Turn maintenance mode on/off straight in MongoDB (e.g. for the very first
 * switch-on, or if nobody can reach the dashboard).
 *
 *   node src/scripts/setMaintenance.js on
 *   node src/scripts/setMaintenance.js on 2026-10-20T18:30:00+05:30
 *   node src/scripts/setMaintenance.js on 120          (minutes from now)
 *   node src/scripts/setMaintenance.js off
 *
 * Optional 3rd argument: message shown to customers.
 */
require("dotenv").config();

const mongoose = require("mongoose");
const Settings = require("../models/Settings");

async function main() {
  const [mode, windowArg, ...messageParts] = process.argv.slice(2);

  if (!["on", "off"].includes(mode)) {
    console.error("Usage: node src/scripts/setMaintenance.js <on|off> [endISO|minutes] [message]");
    process.exit(1);
  }

  let endTime = null;

  if (mode === "on" && windowArg) {
    endTime = /^\d+$/.test(windowArg)
      ? new Date(Date.now() + Number(windowArg) * 60 * 1000)
      : new Date(windowArg);

    if (Number.isNaN(endTime.getTime())) {
      console.error("Invalid end time.");
      process.exit(1);
    }
  }

  const uri = process.env.ATLAS_URI || process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error("Set ATLAS_URI (or MONGO_URI) in your .env first.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  const doc =
    (await Settings.findOne({ key: "maintenance" })) ||
    new Settings({ key: "maintenance" });

  doc.maintenance.enabled = mode === "on";
  doc.maintenance.startTime = null;
  doc.maintenance.endTime = mode === "on" ? endTime : null;

  const message = messageParts.join(" ").trim();
  if (message) doc.maintenance.message = message.slice(0, 300);

  doc.maintenance.updatedBy = { id: null, name: "setMaintenance script" };

  await doc.save();

  console.log(
    `Maintenance is now ${mode.toUpperCase()}` +
      (endTime ? ` until ${endTime.toISOString()}` : "")
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
