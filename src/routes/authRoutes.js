const express = require("express");

const {
  register,
  login,
  logout,
  getMe,
  updateMe,
  uploadProfilePicture,
  removeProfilePicture,
  changePassword,
} = require("../controllers/authController");

const { protect } = require("../middleware/auth");

const {
  uploadProfilePicture:
    profilePictureUpload,
} = require("../middleware/upload");

const router = express.Router();

/*
=====================================================
PUBLIC AUTH ROUTES
=====================================================
*/

// Register
router.post(
  "/register",
  register
);

// Login
router.post(
  "/login",
  login
);

/*
=====================================================
AUTHENTICATED ROUTES
=====================================================
*/

// Logout
router.post(
  "/logout",
  protect,
  logout
);

// Current user
router.get(
  "/me",
  protect,
  getMe
);

// Update profile details
router.put(
  "/me",
  protect,
  updateMe
);

/*
=====================================================
PROFILE PICTURE
=====================================================
*/

// Upload / replace profile picture
router.put(
  "/profile-picture",
  protect,
  profilePictureUpload,
  uploadProfilePicture
);

// Remove profile picture
router.delete(
  "/profile-picture",
  protect,
  removeProfilePicture
);

/*
=====================================================
PASSWORD
=====================================================

Kept for backend compatibility even though the
current Profile UI does not expose password controls.
=====================================================
*/

router.put(
  "/password",
  protect,
  changePassword
);

module.exports = router;