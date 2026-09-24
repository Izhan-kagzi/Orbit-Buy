const crypto = require("crypto");
const mongoose = require("mongoose");
const { baseOptions } = require("./baseOptions");

const userSchema = new mongoose.Schema(
  {
    // String ids keep compatibility with the ids already issued by the
    // old JSON backend (uuid v4 strings + "admin-seed-user-0001").
    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },
    name: {
      type: String,
      required: [true, "Name is required."],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address."],
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      select: false,
    },
    mobile: {
      type: String,
      default: "",
      trim: true,
    },
    role: {
      type: String,
      enum: ["customer", "manager", "admin"],
      default: "customer",
      index: true,
    },
    // Manager session tracking. Historical login/logout/activity records
    // live in ActivityLog; these fields expose the current session quickly.
    currentSessionId: { type: String, default: null },
    currentLoginAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    lastLogoutAt: { type: Date, default: null },
  },
  { ...baseOptions, _id: false }
);

userSchema.set("toJSON", {
  ...baseOptions.toJSON,
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
