/**
 * Drops every Orbit Buy collection in MongoDB and re-imports db.json
 * (falling back to products.seed.json). Destructive — development only.
 *
 * Run with: npm run db:reset
 */

require("dotenv").config();

const { spawnSync } = require("child_process");
const path = require("path");

console.log("⚠️  Dropping all Orbit Buy collections and re-importing...\n");

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "migrate.js"), "--fresh"],
  { stdio: "inherit" }
);

process.exit(result.status ?? 0);
