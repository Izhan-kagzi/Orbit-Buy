const fs = require("fs");
const path = require("path");
const multer = require("multer");

/*
=====================================================
UPLOAD DIRECTORY
=====================================================
*/

const UPLOAD_DIR = path.join(
  __dirname,
  "..",
  "..",
  "public",
  "uploads",
  "custom"
);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/*
=====================================================
STORAGE
=====================================================
*/

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";

    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${ext}`;

    cb(null, uniqueName);
  },
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
  "video/quicktime", // MOV files
];

function fileFilter(req, file, cb) {
  const isImage = allowedImageTypes.includes(file.mimetype);
  const isVideo = allowedVideoTypes.includes(file.mimetype);

  if (isImage || isVideo) {
    return cb(null, true);
  }

  const err = new Error(
    "Only JPG, JPEG, PNG, WEBP images and MP4, WebM or MOV videos are allowed."
  );
  err.code = "INVALID_FILE_TYPE";
  return cb(err, false);
}

/*
=====================================================
MULTER CONFIGURATION
=====================================================
*/

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max per file
    fields: 30, // Allow non-file form fields
    fieldSize: 10 * 1024 * 1024, // 10 MB max for text field content
  },
});

/*
=====================================================
ERROR-SAFE WRAPPER
=====================================================
Multer reports failures through its own callback. Without this
wrapper an oversized file or a bad field name produced an unhandled
500; now every upload error goes to the shared error handler and
comes back as a clean 400.
*/

function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  };
}

// Products: legacy single "image", plus "images" and "videos".
const uploadProductMedia = handleUpload(
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "images", maxCount: 10 },
    { name: "videos", maxCount: 5 },
  ])
);

// Flash sale banners.
const uploadFlashSaleImages = handleUpload(upload.array("images", 6));

module.exports = upload;
module.exports.upload = upload;
module.exports.handleUpload = handleUpload;
module.exports.uploadProductMedia = uploadProductMedia;
module.exports.uploadFlashSaleImages = uploadFlashSaleImages;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
