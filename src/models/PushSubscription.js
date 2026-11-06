const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

// One browser/device push endpoint belonging to a user. A user can have
// several (phone PWA + desktop browser).
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
  },
  baseOptions
);

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
