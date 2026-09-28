const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");
const ManagerActivity = require("../models/ManagerActivity");

const { signToken } = require("../utils/jwt");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const fs = require("fs");
const path = require("path");

const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
=====================================================
REGISTER
POST /api/auth/register
=====================================================
*/

const register = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    mobile = "",
  } = req.body;

  const normalizedName = String(
    name || ""
  ).trim();

  const normalizedEmail = String(
    email || ""
  )
    .toLowerCase()
    .trim();

  if (!normalizedName) {
    throw new ApiError(
      400,
      "Name is required."
    );
  }

  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new ApiError(
      400,
      "Please enter a valid email address."
    );
  }

  if (!password) {
    throw new ApiError(
      400,
      "Password is required."
    );
  }

  if (String(password).length < 6) {
    throw new ApiError(
      400,
      "Password must be at least 6 characters long."
    );
  }

  const existingUser =
    await User.findOne({
      email: normalizedEmail,
    });

  if (existingUser) {
    throw new ApiError(
      409,
      "An account with this email already exists."
    );
  }

  const hashedPassword =
    await bcrypt.hash(
      String(password),
      10
    );

  const user = await User.create({
    name: normalizedName,
    email: normalizedEmail,
    password: hashedPassword,
    mobile: String(mobile || "").trim(),
  });

  /*
  ---------------------------------------------------
  CREATE EMPTY CART
  ---------------------------------------------------
  */

  await Cart.create({
    user: String(user._id),
    items: [],
  });

  /*
  ---------------------------------------------------
  CREATE EMPTY WISHLIST
  ---------------------------------------------------
  */

  await Wishlist.create({
    user: String(user._id),
    products: [],
  });

  const userId = String(user._id);

  const token = signToken({
    id: userId,
  });

  res.status(201).json({
    success: true,
    message:
      "Account created successfully.",
    token,
    user: user.toJSON(),
  });
});

/*
=====================================================
LOGIN
POST /api/auth/login
=====================================================
*/

const login = asyncHandler(async (req, res) => {
  const {
    email,
    password,
  } = req.body;

  const normalizedEmail = String(
    email || ""
  )
    .toLowerCase()
    .trim();

  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new ApiError(
      400,
      "Please enter a valid email address."
    );
  }

  if (!password) {
    throw new ApiError(
      400,
      "Password is required."
    );
  }

  const user =
    await User.findOne({
      email: normalizedEmail,
    }).select("+password");

  if (!user) {
    throw new ApiError(
      401,
      "Invalid email or password."
    );
  }

  const isMatch =
    await bcrypt.compare(
      String(password),
      user.password
    );

  if (!isMatch) {
    throw new ApiError(
      401,
      "Invalid email or password."
    );
  }

  const userId = String(user._id);

  const token = signToken({
    id: userId,
  });

  /*
  ---------------------------------------------------
  MANAGER LOGIN ACTIVITY
  ---------------------------------------------------
  */

  if (user.role === "manager") {
    ManagerActivity.create({
      managerId: userId,
      type: "login",
      action: "Manager logged in",
      method: req.method,
      path: req.originalUrl,
      ip: req.ip || "",
      userAgent:
        req.get("user-agent") || "",
    }).catch((error) => {
      console.error(
        "[manager-activity] login log failed:",
        error.message
      );
    });
  }

  /*
  ---------------------------------------------------
  SESSION INFORMATION
  ---------------------------------------------------
  */

  user.currentSessionId = token;
  user.currentLoginAt = new Date();
  user.lastSeenAt = new Date();

  await user.save();

  console.log(
    "[auth] Login successful:",
    {
      id: userId,
      email: user.email,
      role: user.role,
    }
  );

  res.json({
    success: true,
    token,
    user: user.toJSON(),
  });
});

/*
=====================================================
LOGOUT
POST /api/auth/logout
=====================================================
*/

const logout = asyncHandler(
  async (req, res) => {
    const userId = String(
      req.user?.id || ""
    );

    if (userId) {
      const user =
        await User.findById(userId);

      if (user) {
        user.lastLogoutAt =
          new Date();

        user.lastSeenAt =
          new Date();

        user.currentSessionId =
          null;

        await user.save();
      }
    }

    /*
    ---------------------------------------------------
    MANAGER LOGOUT ACTIVITY
    ---------------------------------------------------
    */

    if (
      req.user &&
      req.user.role === "manager"
    ) {
      await ManagerActivity.create({
        managerId: req.user.id,
        type: "logout",
        action: "Manager logged out",
        method: req.method,
        path: req.originalUrl,
        ip: req.ip || "",
        userAgent:
          req.get("user-agent") || "",
      });
    }

    res.json({
      success: true,
      message:
        "Logged out successfully.",
    });
  }
);

/*
=====================================================
GET CURRENT USER
GET /api/auth/me
=====================================================
*/

const getMe = asyncHandler(
  async (req, res) => {
    const user =
      await User.findById(
        String(req.user.id)
      );

    if (!user) {
      throw new ApiError(
        404,
        "User not found."
      );
    }

    /*
    ---------------------------------------------------
    UPDATE LAST SEEN
    ---------------------------------------------------
    */

    user.lastSeenAt =
      new Date();

    await user.save();

    res.json({
      success: true,
      user: user.toJSON(),
    });
  }
);

/*
=====================================================
UPDATE CURRENT USER PROFILE
PUT /api/auth/me

Supported fields:

- name
- email
- mobile
- shippingAddress
- billingAddress
=====================================================
*/

const updateMe = asyncHandler(
  async (req, res) => {
    const {
      name,
      email,
      mobile,
      shippingAddress,
      billingAddress,
    } = req.body;

    const user =
      await User.findById(
        String(req.user.id)
      );

    if (!user) {
      throw new ApiError(
        404,
        "User not found."
      );
    }

    /*
    ---------------------------------------------------
    NAME
    ---------------------------------------------------
    */

    if (name !== undefined) {
      const normalizedName =
        String(name).trim();

      if (!normalizedName) {
        throw new ApiError(
          400,
          "Name cannot be empty."
        );
      }

      user.name =
        normalizedName;
    }

    /*
    ---------------------------------------------------
    EMAIL
    ---------------------------------------------------
    */

    if (email !== undefined) {
      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();

      if (
        !EMAIL_RE.test(
          normalizedEmail
        )
      ) {
        throw new ApiError(
          400,
          "Please enter a valid email address."
        );
      }

      if (
        normalizedEmail !==
        user.email
      ) {
        const existingUser =
          await User.findOne({
            email:
              normalizedEmail,
            _id: {
              $ne: user._id,
            },
          }).lean();

        if (existingUser) {
          throw new ApiError(
            409,
            "An account with this email already exists."
          );
        }

        user.email =
          normalizedEmail;
      }
    }

    /*
    ---------------------------------------------------
    MOBILE
    ---------------------------------------------------
    */

    if (mobile !== undefined) {
      user.mobile =
        String(mobile).trim();
    }

    /*
    ---------------------------------------------------
    SHIPPING ADDRESS
    ---------------------------------------------------
    */

    if (
      shippingAddress !==
      undefined
    ) {
      user.shippingAddress =
        String(
          shippingAddress
        ).trim();
    }

    /*
    ---------------------------------------------------
    BILLING ADDRESS
    ---------------------------------------------------
    */

    if (
      billingAddress !==
      undefined
    ) {
      user.billingAddress =
        String(
          billingAddress
        ).trim();
    }

    await user.save();

    res.json({
      success: true,
      message:
        "Profile updated successfully.",
      user: user.toJSON(),
    });
  }
);

/*
=====================================================
UPLOAD PROFILE PICTURE
PUT /api/auth/profile-picture
=====================================================

Expected multipart field:

profilePicture
=====================================================
*/

const uploadProfilePicture =
  asyncHandler(
    async (req, res) => {
      if (!req.file) {
        throw new ApiError(
          400,
          "Please select a profile picture."
        );
      }

      const user =
        await User.findById(
          String(req.user.id)
        );

      if (!user) {
        /*
        -----------------------------------------------
        DELETE UPLOADED FILE IF USER DOES NOT EXIST
        -----------------------------------------------
        */

        if (req.file.path) {
          try {
            fs.unlinkSync(
              req.file.path
            );
          } catch (error) {
            console.error(
              "Failed to remove orphan profile image:",
              error.message
            );
          }
        }

        throw new ApiError(
          404,
          "User not found."
        );
      }

      /*
      ---------------------------------------------------
      DELETE PREVIOUS PROFILE IMAGE
      ---------------------------------------------------
      */

      if (
        user.profilePicture &&
        user.profilePicture.startsWith(
          "/uploads/profiles/"
        )
      ) {
        const oldRelativePath =
          user.profilePicture.replace(
            /^\/+/,
            ""
          );

        const oldFilePath =
          path.join(
            process.cwd(),
            "public",
            oldRelativePath
          );

        try {
          if (
            fs.existsSync(
              oldFilePath
            )
          ) {
            fs.unlinkSync(
              oldFilePath
            );
          }
        } catch (error) {
          console.error(
            "Failed to delete previous profile picture:",
            error.message
          );
        }
      }

      /*
      ---------------------------------------------------
      SAVE NEW IMAGE PATH
      ---------------------------------------------------
      */

      const filename =
        path.basename(
          req.file.path
        );

      user.profilePicture =
        `/uploads/profiles/${filename}`;

      user.lastSeenAt =
        new Date();

      await user.save();

      res.json({
        success: true,
        message:
          "Profile picture updated successfully.",
        profilePicture:
          user.profilePicture,
        user: user.toJSON(),
      });
    }
  );

/*
=====================================================
REMOVE PROFILE PICTURE
DELETE /api/auth/profile-picture
=====================================================
*/

const removeProfilePicture =
  asyncHandler(
    async (req, res) => {
      const user =
        await User.findById(
          String(req.user.id)
        );

      if (!user) {
        throw new ApiError(
          404,
          "User not found."
        );
      }

      /*
      ---------------------------------------------------
      DELETE IMAGE FILE
      ---------------------------------------------------
      */

      if (
        user.profilePicture &&
        user.profilePicture.startsWith(
          "/uploads/profiles/"
        )
      ) {
        const relativePath =
          user.profilePicture.replace(
            /^\/+/,
            ""
          );

        const filePath =
          path.join(
            process.cwd(),
            "public",
            relativePath
          );

        try {
          if (
            fs.existsSync(
              filePath
            )
          ) {
            fs.unlinkSync(
              filePath
            );
          }
        } catch (error) {
          console.error(
            "Failed to delete profile picture:",
            error.message
          );
        }
      }

      user.profilePicture =
        "";

      await user.save();

      res.json({
        success: true,
        message:
          "Profile picture removed successfully.",
        profilePicture: "",
        user: user.toJSON(),
      });
    }
  );

/*
=====================================================
CHANGE PASSWORD
PUT /api/auth/password
=====================================================

Kept in backend even though the current Profile UI
does not expose password controls.
=====================================================
*/

const changePassword =
  asyncHandler(
    async (req, res) => {
      const {
        currentPassword,
        newPassword,
      } = req.body;

      if (
        !currentPassword ||
        !newPassword
      ) {
        throw new ApiError(
          400,
          "Current and new password are required."
        );
      }

      if (
        String(newPassword).length <
        6
      ) {
        throw new ApiError(
          400,
          "New password must be at least 6 characters long."
        );
      }

      const user =
        await User.findById(
          String(req.user.id)
        ).select("+password");

      if (!user) {
        throw new ApiError(
          404,
          "User not found."
        );
      }

      const isMatch =
        await bcrypt.compare(
          String(currentPassword),
          user.password
        );

      if (!isMatch) {
        throw new ApiError(
          401,
          "Current password is incorrect."
        );
      }

      user.password =
        await bcrypt.hash(
          String(newPassword),
          10
        );

      await user.save();

      res.json({
        success: true,
        message:
          "Password updated successfully.",
      });
    }
  );

/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {
  register,
  login,
  logout,
  getMe,
  updateMe,
  uploadProfilePicture,
  removeProfilePicture,
  changePassword,
};