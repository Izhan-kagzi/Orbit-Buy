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
  fs.mkdirSync(UPLOAD_DIR, {
    recursive: true,
  });
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
    const ext =
      path.extname(file.originalname).toLowerCase() || ".jpg";

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
];

const allowedVideoTypes = [
  "video/mp4",
  "video/webm",
  "video/quicktime", // MOV files
];

/*
=====================================================
FILE FILTER
=====================================================
*/

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

Supports:
- image  -> single legacy image
- images -> up to 10 images
- videos -> up to 5 videos

Limits:
- 100MB per file
- Up to 30 non-file text fields allowed in FormData
=====================================================
*/

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max per file
    fields: 30,                  // Allow non-file form fields
    fieldSize: 10 * 1024 * 1024  // 10 MB max for text field content
  },
});

module.exports = upload;