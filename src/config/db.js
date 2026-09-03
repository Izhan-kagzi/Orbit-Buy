const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");
const SEED_PRODUCTS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "products.seed.json"
);

/**
 * This project uses a lightweight JSON-file "database" instead of
 * MongoDB/Postgres so the whole backend runs with zero external
 * services or network access — clone it, `npm install`, `npm start`,
 * done. The data-access shape (find/insert/update/delete by id) is
 * intentionally database-agnostic, so swapping this file out for a
 * real Mongoose/Prisma layer later only touches this one module.
 */

function defaultData() {
  let products = [];

  try {
    products = JSON.parse(
      fs.readFileSync(SEED_PRODUCTS_PATH, "utf-8")
    );
  } catch (error) {
    console.error("Failed to load seed products:", error.message);
  }

  const adminId = "admin-seed-user-0001";
  const now = new Date();
  const farFuture = new Date(now.getFullYear() + 2, 0, 1).toISOString();
  const startOfThisYear = new Date(now.getFullYear(), 0, 1).toISOString();

  return {
    users: [
      {
        id: adminId,
        name: "Orbit Buy Admin",
        email: "admin@orbitbuy.com",
        // password: Admin@123 (change this after first login in production)
        password:
          "$2a$10$sgube0S/kZAtfukcdz4j2evwCpQJL3ZCi7FxSTKxG.AMi4IFK9SIK",
        mobile: "",
        role: "admin",
        createdAt: new Date().toISOString(),
      },
    ],
    products,
    carts: { [adminId]: [] }, // userId -> [{ productId, quantity }]
    wishlists: { [adminId]: [] }, // userId -> [productId]
    orders: [], // { id, userId, items, ... }
    coupons: [
      {
        id: "coupon-welcome10",
        code: "WELCOME10",
        discountType: "flat",
        discountValue: 100,
        startDate: startOfThisYear,
        endDate: farFuture,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "coupon-save20",
        code: "SAVE20",
        discountType: "flat",
        discountValue: 200,
        startDate: startOfThisYear,
        endDate: farFuture,
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "coupon-orbit50",
        code: "ORBIT50",
        discountType: "flat",
        discountValue: 500,
        startDate: startOfThisYear,
        endDate: farFuture,
        active: true,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

// Backfills any keys missing from an older db.json (e.g. after an
// update adds a new top-level collection like `coupons`) so existing
// installs don't crash on read.
function ensureShape(data) {
  const fallback = defaultData();

  let changed = false;

  for (const key of Object.keys(fallback)) {
    if (data[key] === undefined) {
      // Don't reseed products/users/orders if they already diverged —
      // only fill in genuinely missing collections.
      data[key] = key === "products" ? fallback.products : fallback[key];
      changed = true;
    }
  }

  return { data, changed };
}

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = defaultData();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    const { data, changed } = ensureShape(parsed);
    if (changed) {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    }

    return data;
  } catch (error) {
    console.error(
      "Failed to read db.json, reinitializing:",
      error.message
    );
    const initial = defaultData();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
