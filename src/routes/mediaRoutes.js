const express = require("express");
const { getBucket } = require("../utils/gridfs");

const router = express.Router();

/**
 * Serves media stored in MongoDB GridFS at:
 *   /uploads/products/<filename>
 *   /uploads/custom/<filename>
 *
 * Supports HTTP Range requests (required for <video> seeking/playback).
 * If the file is not in GridFS (e.g. bundled seed images) it calls
 * next() so the normal static handlers can serve it.
 */
router.get("/:folder(products|custom)/:filename", async (req, res, next) => {
  try {
    const filename = decodeURIComponent(req.params.filename);

    let bucket;
    try {
      bucket = getBucket();
    } catch (_) {
      // DB not connected: let the static handlers try instead.
      return next();
    }

    const file = (
      await bucket.find({ filename }).sort({ uploadDate: -1 }).limit(1).toArray()
    )[0];

    if (!file) return next();

    const total = file.length;
    const contentType = file.contentType || "application/octet-stream";

    res.set({
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=604800, immutable",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });

    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);

      if (!match) {
        res.status(416).set("Content-Range", `bytes */${total}`);
        return res.end();
      }

      let start = match[1] === "" ? NaN : parseInt(match[1], 10);
      let end = match[2] === "" ? NaN : parseInt(match[2], 10);

      if (Number.isNaN(start)) {
        // suffix range: last N bytes
        start = Math.max(total - end, 0);
        end = total - 1;
      } else if (Number.isNaN(end) || end >= total) {
        end = total - 1;
      }

      if (start > end || start >= total) {
        res.status(416).set("Content-Range", `bytes */${total}`);
        return res.end();
      }

      res.status(206).set({
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": end - start + 1,
      });

      return bucket
        .openDownloadStream(file._id, { start, end: end + 1 })
        .on("error", next)
        .pipe(res);
    }

    res.set("Content-Length", total);

    bucket.openDownloadStream(file._id).on("error", next).pipe(res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
