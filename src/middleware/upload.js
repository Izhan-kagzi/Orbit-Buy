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

const PRODUCT_UPLOAD_DIR = path.join(
  UPLOAD_ROOT,
  "products"
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

[
  UPLOAD_ROOT,
  PRODUCT_UPLOAD_DIR,
  CUSTOM_UPLOAD_DIR,
  PROFILE_UPLOAD_DIR,
].forEach((directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }
});

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
  const mimetype = String(
    file.mimetype || ""
  ).toLowerCase();

  const isImage =
    allowedImageTypes.includes(mimetype);

  const isVideo =
    allowedVideoTypes.includes(mimetype);

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
PRODUCT STORAGE
=====================================================
*/

const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PRODUCT_UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const originalExtension = path
      .extname(file.originalname || "")
      .toLowerCase();

    /*
    ---------------------------------------------------
    Fallback extensions
    ---------------------------------------------------
    */

    let extension = originalExtension;

    if (!extension) {
      if (
        allowedVideoTypes.includes(
          String(file.mimetype || "").toLowerCase()
        )
      ) {
        extension = ".mp4";
      } else {
        extension = ".jpg";
      }
    }

    /*
    ---------------------------------------------------
    Safe unique filename
    ---------------------------------------------------
    */

    const uniqueName = `product-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${extension}`;

    cb(null, uniqueName);
  },
});

/*
=====================================================
PROFILE PICTURE STORAGE
=====================================================
*/

const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PROFILE_UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const originalExtension = path
      .extname(file.originalname || "")
      .toLowerCase();

    const extension =
      originalExtension || ".jpg";

    const userId = String(
      req.user?.id || "user"
    ).replace(
      /[^a-zA-Z0-9_-]/g,
      ""
    );

    const uniqueName = `profile-${userId}-${Date.now()}${extension}`;

    cb(null, uniqueName);
  },
});

/*
=====================================================
GENERAL MULTER INSTANCE
=====================================================

Used by:
- Product uploads
- Flash sale images
- Other general uploads
=====================================================
*/

const upload = multer({
  storage: productStorage,

  fileFilter,

  limits: {
    /*
    Maximum individual file size:
    100 MB

    This allows product videos to be uploaded
    without being rejected by Multer.
    */
    fileSize: 100 * 1024 * 1024,

    /*
    Maximum number of non-file fields.
    */
    fields: 30,

    /*
    Maximum size of an individual text field.
    */
    fieldSize: 10 * 1024 * 1024,
  },
});

/*
=====================================================
PROFILE PICTURE MULTER
=====================================================
*/

const profileUpload = multer({
  storage: profileStorage,

  fileFilter: (req, file, cb) => {
    const mimetype = String(
      file.mimetype || ""
    ).toLowerCase();

    if (!allowedImageTypes.includes(mimetype)) {
      const error = new Error(
        "Profile picture must be a JPG, JPEG, PNG, WEBP or AVIF image."
      );

      error.code =
        "INVALID_PROFILE_IMAGE_TYPE";

      return cb(error, false);
    }

    cb(null, true);
  },

  limits: {
    /*
    Profile pictures:
    Maximum 5 MB
    */
    fileSize: 5 * 1024 * 1024,

    files: 1,

    fields: 5,
  },
});

/*
=====================================================
ERROR-SAFE MULTER WRAPPER
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
PRODUCT MEDIA UPLOAD
=====================================================

Accepted multipart fields:

image
  → maximum 1 image
  → legacy single-image support

images
  → maximum 10 images

videos
  → maximum 5 videos

The uploaded files are physically stored at:

public/uploads/products/
=====================================================
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
=====================================================
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

/*
-----------------------------------------------------
Directory exports
-----------------------------------------------------
*/

module.exports.UPLOAD_DIR =
  PRODUCT_UPLOAD_DIR;

module.exports.CUSTOM_UPLOAD_DIR =
  CUSTOM_UPLOAD_DIR;

module.exports.PRODUCT_UPLOAD_DIR =
  PRODUCT_UPLOAD_DIR;

module.exports.PROFILE_UPLOAD_DIR =
  PROFILE_UPLOAD_DIR;

/*
-----------------------------------------------------
Allowed type exports
-----------------------------------------------------

Useful if another backend file needs to validate
the same media types.
-----------------------------------------------------
*/

module.exports.allowedImageTypes =
  allowedImageTypes;

module.exports.allowedVideoTypes =
  allowedVideoTypes;