const mongoose = require("mongoose");

/**
 * GridFS helpers — product / flash-sale media lives in MongoDB Atlas
 * (collections `media.files` and `media.chunks`).
 */

const BUCKET_NAME = "media";

let bucket = null;
let bucketDb = null;

function getBucket() {
  const db = mongoose.connection.db;

  if (!db || mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected; cannot access media storage.");
  }

  // Recreate if the connection was re-established.
  if (!bucket || bucketDb !== db) {
    bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
    bucketDb = db;
  }

  return bucket;
}

/** Multer storage engine that streams uploads straight into GridFS. */
function gridfsStorage({ getFilename }) {
  return {
    _handleFile(req, file, cb) {
      let uploadStream;

      try {
        const filename = getFilename(req, file);

        uploadStream = getBucket().openUploadStream(filename, {
          contentType: file.mimetype,
          metadata: { originalName: file.originalname },
        });

        file.stream
          .pipe(uploadStream)
          .on("error", cb)
          .on("finish", () => {
            cb(null, {
              filename,
              id: uploadStream.id,
              size: uploadStream.length,
              contentType: file.mimetype,
            });
          });
      } catch (error) {
        cb(error);
      }
    },

    _removeFile(req, file, cb) {
      try {
        if (!file.id) return cb(null);

        getBucket()
          .delete(file.id)
          .then(() => cb(null))
          .catch(() => cb(null));
      } catch (_) {
        cb(null);
      }
    },
  };
}

/** Pull the GridFS filename out of a stored path like /uploads/products/x.jpg */
function filenameFromPath(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/\/uploads\/(?:products|custom)\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Best-effort delete of GridFS files referenced by stored paths. */
async function deleteMediaByPaths(paths = []) {
  const names = [...new Set(paths.map(filenameFromPath).filter(Boolean))];

  for (const name of names) {
    try {
      const files = await getBucket().find({ filename: name }).toArray();
      for (const f of files) {
        await getBucket().delete(f._id);
      }
    } catch (_) {
      // Cleanup must never break the request.
    }
  }
}

module.exports = {
  getBucket,
  gridfsStorage,
  deleteMediaByPaths,
  filenameFromPath,
  BUCKET_NAME,
};
