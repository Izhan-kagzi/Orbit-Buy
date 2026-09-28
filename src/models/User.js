const crypto = require("crypto");
const mongoose = require("mongoose");

const { baseOptions } = require("./baseOptions");

const userSchema = new mongoose.Schema(
  {
    // =====================================================
    // STRING USER ID
    // =====================================================

    _id: {
      type: String,
      default: () => crypto.randomUUID(),
    },

    // =====================================================
    // BASIC PROFILE
    // =====================================================

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
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please enter a valid email address.",
      ],
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

    // =====================================================
    // PROFILE PICTURE
    // =====================================================

    profilePicture: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // SHIPPING ADDRESS
    // =====================================================

    shippingAddress: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // BILLING ADDRESS
    // =====================================================

    billingAddress: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // ROLE
    // =====================================================

    role: {
      type: String,
      enum: ["customer", "manager", "admin"],
      default: "customer",
      index: true,
    },

    // =====================================================
    // MANAGER SESSION TRACKING
    // =====================================================

    currentSessionId: {
      type: String,
      default: null,
    },

    currentLoginAt: {
      type: Date,
      default: null,
    },

    lastSeenAt: {
      type: Date,
      default: null,
    },

    lastLogoutAt: {
      type: Date,
      default: null,
    },
  },
  {
    ...baseOptions,
    _id: false,
  }
);

// =========================================================
// JSON RESPONSE
// =========================================================

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