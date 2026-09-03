// Deletes the runtime db.json so the server regenerates it fresh from
// products.seed.json on next start. Run with: node src/scripts/resetDb.js
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log("db.json removed. It will be recreated from the product seed on next server start.");
} else {
  console.log("No db.json found — nothing to reset.");
}
