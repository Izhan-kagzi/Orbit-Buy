const fs = require("fs");
const path = require("path");
const multer = require("multer");

/*
=====================================================
UPLOAD DIRECTORIES
=====================================================
*/

const UPLOAD_ROOT = path.join(
  __dirname,
  "..",
  "..",
  "public",
  "uploads"
);

const CUSTOM_UPLOAD_DIR = path.join(
  UPLOAD_ROOT,
  "custom"
);

const PROFILE_UPLOAD_DIR = path.join(
  UPLOAD_ROOT,
  "profiles"
);

/*
=====================================================
CREATE DIRECTORIES
=====================================================
*/

if (!fs.existsSync(CUSTOM_UPLOAD_DIR)) {
  fs.mkdirSync(CUSTOM_UPLOAD_DIR, {
    recursive: true,
  });
}

if (!fs.existsSync(PROFILE_UPLOAD_DIR)) {
  fs.mkdirSync(PROFILE_UPLOAD_DIR, {
    recursive: true,
  });
}

/*
=====================================================
ALLOWED FILE TYPES
=====================================================
*/

const allowedImageTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
];

const allowedVideoTypes = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

/*
=====================================================
GENERAL FILE FILTER
=====================================================
*/

function fileFilter(req, file, cb) {
  const isImage = allowedImageTypes.includes(
    file.mimetype
  );

  const isVideo = allowedVideoTypes.includes(
    file.mimetype
  );

  if (isImage || isVideo) {
    return cb(null, true);
  }

  const error = new Error(
    "Only JPG, JPEG, PNG, WEBP, AVIF images and MP4, WebM or MOV videos are allowed."
  );

  error.code = "INVALID_FILE_TYPE";

  return cb(error, false);
}

/*
=====================================================
CUSTOM / PRODUCT STORAGE
=====================================================
*/

const customStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CUSTOM_UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const ext =
      path.extname(file.originalname).toLowerCase() ||
      ".jpg";

    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${ext}`;

    cb(null, uniqueName);
  },
});

/*
=====================================================
PROFILE PICTURE STORAGE
=====================================================

Profile pictures are stored separately from product
uploads so they can be managed independently.
*/

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PROFILE_UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const ext =
      path.extname(file.originalname).toLowerCase() ||
      ".jpg";

    const userId = String(
      req.user?.id || "user"
    ).replace(/[^a-zA-Z0-9_-]/g, "");

    const uniqueName = `profile-${userId}-${Date.now()}${ext}`;

    cb(null, uniqueName);
  },
});

/*
=====================================================
GENERAL MULTER INSTANCE
=====================================================
*/

const upload = multer({
  storage: customStorage,

  fileFilter,

  limits: {
    // Existing product/video upload limit.
    fileSize: 100 * 1024 * 1024,

    fields: 30,

    fieldSize: 10 * 1024 * 1024,
  },
});

/*
=====================================================
PROFILE PICTURE MULTER INSTANCE
=====================================================

Profile pictures:
- Images only
- Maximum 5 MB
- One file only
*/

const profileUpload = multer({
  storage: profileStorage,

  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      const error = new Error(
        "Profile picture must be a JPG, JPEG, PNG, WEBP or AVIF image."
      );

      error.code = "INVALID_PROFILE_IMAGE_TYPE";

      return cb(error, false);
    }

    cb(null, true);
  },

  limits: {
    fileSize: 5 * 1024 * 1024,

    files: 1,

    fields: 5,
  },
});

/*
=====================================================
ERROR-SAFE WRAPPER
=====================================================
*/

function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) {
        return next(err);
      }

      next();
    });
  };
}

/*
=====================================================
PRODUCT MEDIA
=====================================================

Supports:

image  -> one legacy image
images -> up to 10 images
videos -> up to 5 videos
*/

const uploadProductMedia = handleUpload(
  upload.fields([
    {
      name: "image",
      maxCount: 1,
    },

    {
      name: "images",
      maxCount: 10,
    },

    {
      name: "videos",
      maxCount: 5,
    },
  ])
);

/*
=====================================================
FLASH SALE IMAGES
=====================================================
*/

const uploadFlashSaleImages = handleUpload(
  upload.array("images", 6)
);

/*
=====================================================
PROFILE PICTURE
=====================================================

Expected multipart field:

profilePicture

Example:

FormData:
profilePicture = selected image
*/

const uploadProfilePicture = handleUpload(
  profileUpload.single("profilePicture")
);

/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = upload;

module.exports.upload = upload;

module.exports.profileUpload =
  profileUpload;

module.exports.handleUpload =
  handleUpload;

module.exports.uploadProductMedia =
  uploadProductMedia;

module.exports.uploadFlashSaleImages =
  uploadFlashSaleImages;

module.exports.uploadProfilePicture =
  uploadProfilePicture;

module.exports.UPLOAD_DIR =
  CUSTOM_UPLOAD_DIR;

module.exports.CUSTOM_UPLOAD_DIR =
  CUSTOM_UPLOAD_DIR;

module.exports.PROFILE_UPLOAD_DIR =
  PROFILE_UPLOAD_DIR;