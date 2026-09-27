// ============================================================
// Orbit Buy - Import db.json → MongoDB Atlas
// File: backend/src/data/importDbToAtlas.js
// ============================================================

const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

require("dotenv").config();

// ============================================================
// CONFIG
// ============================================================

const ATLAS_URI = process.env.ATLAS_URI;

const DB_NAME = "orbit_buy";

const JSON_FILE = path.join(__dirname, "db.json");

const COLLECTIONS = [
  "reviews",
  "users",
  "products",
  "orders",
  "coupons",
  "carts",
  "wishlists",
];

// ============================================================
// VALIDATION
// ============================================================

if (!ATLAS_URI) {
  console.error("\n❌ ATLAS_URI is missing.");
  console.error(
    "\nCreate/update backend/.env with:"
  );
  console.error(
    "\nATLAS_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/"
  );
  console.error("");
  process.exit(1);
}

if (!fs.existsSync(JSON_FILE)) {
  console.error(`\n❌ db.json not found: ${JSON_FILE}`);
  process.exit(1);
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Recursively converts MongoDB values into the format
 * expected by the Orbit Buy Mongoose schemas.
 *
 * Orbit Buy uses String IDs.
 *
 * Examples:
 *
 * ObjectId("abc123...")
 *       ↓
 * "abc123..."
 *
 * { "$oid": "abc123..." }
 *       ↓
 * "abc123..."
 *
 * { "$date": "2026-01-01T00:00:00.000Z" }
 *       ↓
 * Date(...)
 */
function convertMongoValues(value) {
  // ----------------------------------------------------------
  // Actual BSON ObjectId
  // ----------------------------------------------------------

  if (value instanceof ObjectId) {
    return value.toString();
  }

  // ----------------------------------------------------------
  // Arrays
  // ----------------------------------------------------------

  if (Array.isArray(value)) {
    return value.map(convertMongoValues);
  }

  // ----------------------------------------------------------
  // Objects
  // ----------------------------------------------------------

  if (value && typeof value === "object") {
    // --------------------------------------------------------
    // MongoDB Extended JSON ObjectId
    // --------------------------------------------------------

    if (
      Object.keys(value).length === 1 &&
      typeof value.$oid === "string"
    ) {
      return value.$oid;
    }

    // --------------------------------------------------------
    // MongoDB Extended JSON Date
    // --------------------------------------------------------

    if (
      Object.keys(value).length === 1 &&
      value.$date !== undefined
    ) {
      const dateValue = value.$date;

      if (typeof dateValue === "string") {
        const date = new Date(dateValue);

        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }

      if (typeof dateValue === "number") {
        const date = new Date(dateValue);

        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }

      return dateValue;
    }

    // --------------------------------------------------------
    // Normal object
    // --------------------------------------------------------

    const result = {};

    for (const [key, val] of Object.entries(value)) {
      result[key] = convertMongoValues(val);
    }

    return result;
  }

  // ----------------------------------------------------------
  // Primitive
  // ----------------------------------------------------------

  return value;
}

/**
 * Converts known ISO date strings into JavaScript Date objects.
 *
 * This supports normal JSON date strings in db.json in addition
 * to MongoDB Extended JSON $date values.
 */
function convertDates(value) {
  if (Array.isArray(value)) {
    return value.map(convertDates);
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, val] of Object.entries(value)) {
      if (
        typeof val === "string" &&
        /^(createdAt|updatedAt|startDate|endDate|requestedAt|resolvedAt|currentLoginAt|lastSeenAt|lastLogoutAt)$/.test(
          key
        ) &&
        !Number.isNaN(Date.parse(val))
      ) {
        result[key] = new Date(val);
      } else {
        result[key] = convertDates(val);
      }
    }

    return result;
  }

  return value;
}

/**
 * Full recursive document normalization.
 */
function normalizeDocument(document) {
  const mongoConverted = convertMongoValues(document);

  return convertDates(mongoConverted);
}

/**
 * IMPORTANT:
 *
 * db.json uses:
 *
 *   id
 *
 * while the Mongoose schemas use:
 *
 *   _id
 *
 * Therefore we must explicitly convert:
 *
 *   id → _id
 *
 * If we leave `id` unchanged and don't create `_id`,
 * MongoDB's native driver automatically generates an ObjectId.
 *
 * That was the cause of the previous:
 *
 *   _id type: object
 *
 * problem.
 */
function normalizeStringId(document) {
  if (!document || typeof document !== "object") {
    return document;
  }

  const result = {
    ...document,
  };

  // ----------------------------------------------------------
  // Existing _id
  // ----------------------------------------------------------

  if (
    result._id !== undefined &&
    result._id !== null
  ) {
    result._id = String(result._id);
  }

  // ----------------------------------------------------------
  // db.json uses `id`
  // ----------------------------------------------------------

  if (
    result._id === undefined ||
    result._id === null
  ) {
    if (
      result.id !== undefined &&
      result.id !== null
    ) {
      result._id = String(result.id);
    }
  }

  // ----------------------------------------------------------
  // Remove legacy top-level `id`
  //
  // We don't want both:
  //
  // id
  // _id
  //
  // The application uses Mongoose _id.
  // ----------------------------------------------------------

  delete result.id;

  return result;
}

/**
 * Normalize a normal array-based collection.
 */
function normalizeCollectionDocuments(documents) {
  return documents.map((document) => {
    const normalized = normalizeDocument(document);

    return normalizeStringId(normalized);
  });
}

// ============================================================
// CART / WISHLIST NORMALIZATION
// ============================================================

/**
 * db.json stores carts/wishlists as:
 *
 * {
 *   "admin-seed-user-0001": [],
 *   "some-user-id": []
 * }
 *
 * Cart schema expects:
 *
 * {
 *   user: String,
 *   items: []
 * }
 *
 * Wishlist schema expects:
 *
 * {
 *   user: String,
 *   products: []
 * }
 */
function normalizeUserCollection(
  collectionName,
  sourceData
) {
  return Object.entries(sourceData).map(
    ([userId, value]) => {
      const normalizedValue =
        normalizeDocument(value);

      if (collectionName === "carts") {
        return {
          user: String(userId),
          items: Array.isArray(normalizedValue)
            ? normalizedValue
            : [],
        };
      }

      return {
        user: String(userId),
        products: Array.isArray(normalizedValue)
          ? normalizedValue
          : [],
      };
    }
  );
}

// ============================================================
// MAIN IMPORT
// ============================================================

async function importDatabase() {
  let client;

  try {
    console.log("\n==============================================");
    console.log(" Orbit Buy → MongoDB Atlas Import");
    console.log("==============================================\n");

    // --------------------------------------------------------
    // Read db.json
    // --------------------------------------------------------

    console.log("📂 Reading:");
    console.log(JSON_FILE);

    const rawData = fs.readFileSync(
      JSON_FILE,
      "utf8"
    );

    const data = JSON.parse(rawData);

    console.log("✅ db.json loaded successfully.\n");

    // --------------------------------------------------------
    // Connect Atlas
    // --------------------------------------------------------

    console.log("🔌 Connecting to MongoDB Atlas...");

    client = new MongoClient(ATLAS_URI);

    await client.connect();

    console.log(
      "✅ Connected to MongoDB Atlas.\n"
    );

    const db = client.db(DB_NAME);

    console.log(
      `🗄️ Database: ${DB_NAME}\n`
    );

    // --------------------------------------------------------
    // Import each collection
    // --------------------------------------------------------

    for (const collectionName of COLLECTIONS) {
      const sourceData = data[collectionName];

      if (sourceData === undefined) {
        console.log(
          `⚠️ ${collectionName}: not found in db.json`
        );

        continue;
      }

      // ======================================================
      // CARTS / WISHLISTS
      // ======================================================

      if (
        collectionName === "carts" ||
        collectionName === "wishlists"
      ) {
        if (
          !sourceData ||
          typeof sourceData !== "object" ||
          Array.isArray(sourceData)
        ) {
          console.log(
            `⚠️ ${collectionName}: expected an object keyed by user ID`
          );

          continue;
        }

        const documents =
          normalizeUserCollection(
            collectionName,
            sourceData
          );

        const collection =
          db.collection(collectionName);

        // Delete previous imported data.
        await collection.deleteMany({});

        if (documents.length > 0) {
          await collection.insertMany(
            documents
          );
        }

        console.log(
          `✅ ${collectionName}: imported ${documents.length} documents`
        );

        continue;
      }

      // ======================================================
      // NORMAL ARRAY COLLECTIONS
      // ======================================================

      if (!Array.isArray(sourceData)) {
        console.log(
          `⚠️ ${collectionName}: expected an array, skipping`
        );

        continue;
      }

      // ------------------------------------------------------
      // Normalize documents
      // ------------------------------------------------------

      const documents =
        normalizeCollectionDocuments(
          sourceData
        );

      // ------------------------------------------------------
      // Debug first document before insertion
      // ------------------------------------------------------

      if (
        (collectionName === "users" ||
          collectionName === "products" ||
          collectionName === "orders" ||
          collectionName === "coupons") &&
        documents.length > 0
      ) {
        console.log(
          `\n🔎 ${collectionName} first document ID check:`
        );

        console.log(
          "   _id:",
          documents[0]._id
        );

        console.log(
          "   _id type:",
          typeof documents[0]._id
        );
      }

      const collection =
        db.collection(collectionName);

      // ------------------------------------------------------
      // Clear existing collection
      // ------------------------------------------------------

      await collection.deleteMany({});

      // ------------------------------------------------------
      // Insert documents
      // ------------------------------------------------------

      if (documents.length > 0) {
        await collection.insertMany(
          documents
        );
      }

      console.log(
        `✅ ${collectionName}: imported ${documents.length} documents`
      );
    }

    // ========================================================
    // FINAL COUNTS
    // ========================================================

    console.log("\n==============================================");
    console.log(" Atlas Import Summary");
    console.log("==============================================\n");

    for (const collectionName of COLLECTIONS) {
      const count = await db
        .collection(collectionName)
        .countDocuments();

      console.log(
        `📦 ${collectionName}: ${count}`
      );
    }

    // ========================================================
    // VERIFY ID TYPES
    // ========================================================

    console.log("\n==============================================");
    console.log(" ID Type Verification");
    console.log("==============================================\n");

    // --------------------------------------------------------
    // Users
    // --------------------------------------------------------

    const sampleUser =
      await db.collection("users").findOne({});

    if (sampleUser) {
      console.log("👤 User sample:");

      console.log(
        "   _id:",
        sampleUser._id
      );

      console.log(
        "   _id type:",
        typeof sampleUser._id
      );

      console.log(
        "   email:",
        sampleUser.email
      );

      console.log(
        "   role:",
        sampleUser.role
      );
    } else {
      console.log(
        "⚠️ No users found."
      );
    }

    // --------------------------------------------------------
    // Products
    // --------------------------------------------------------

    const sampleProduct =
      await db.collection("products").findOne({});

    if (sampleProduct) {
      console.log("\n🛍️ Product sample:");

      console.log(
        "   _id:",
        sampleProduct._id
      );

      console.log(
        "   _id type:",
        typeof sampleProduct._id
      );

      console.log(
        "   slug:",
        sampleProduct.slug
      );

      console.log(
        "   name:",
        sampleProduct.name
      );
    } else {
      console.log(
        "\n⚠️ No products found."
      );
    }

    // --------------------------------------------------------
    // Cart verification
    // --------------------------------------------------------

    const sampleCart =
      await db.collection("carts").findOne({});

    if (sampleCart) {
      console.log("\n🛒 Cart sample:");

      console.log(
        "   user:",
        sampleCart.user
      );

      console.log(
        "   user type:",
        typeof sampleCart.user
      );

      console.log(
        "   items:",
        Array.isArray(sampleCart.items)
          ? sampleCart.items.length
          : "invalid"
      );

      console.log(
        "   has userId field:",
        Object.prototype.hasOwnProperty.call(
          sampleCart,
          "userId"
        )
      );
    } else {
      console.log(
        "\n⚠️ No carts found."
      );
    }

    // --------------------------------------------------------
    // Wishlist verification
    // --------------------------------------------------------

    const sampleWishlist =
      await db.collection("wishlists").findOne({});

    if (sampleWishlist) {
      console.log("\n❤️ Wishlist sample:");

      console.log(
        "   user:",
        sampleWishlist.user
      );

      console.log(
        "   user type:",
        typeof sampleWishlist.user
      );

      console.log(
        "   products:",
        Array.isArray(sampleWishlist.products)
          ? sampleWishlist.products.length
          : "invalid"
      );

      console.log(
        "   has userId field:",
        Object.prototype.hasOwnProperty.call(
          sampleWishlist,
          "userId"
        )
      );
    } else {
      console.log(
        "\n⚠️ No wishlists found."
      );
    }

    // ========================================================
    // FINAL VALIDATION
    // ========================================================

    const userIdIsString =
      !sampleUser ||
      typeof sampleUser._id === "string";

    const productIdIsString =
      !sampleProduct ||
      typeof sampleProduct._id === "string";

    const cartStructureIsCorrect =
      !sampleCart ||
      (
        typeof sampleCart.user === "string" &&
        !Object.prototype.hasOwnProperty.call(
          sampleCart,
          "userId"
        )
      );

    const wishlistStructureIsCorrect =
      !sampleWishlist ||
      (
        typeof sampleWishlist.user === "string" &&
        !Object.prototype.hasOwnProperty.call(
          sampleWishlist,
          "userId"
        )
      );

    if (
      !userIdIsString ||
      !productIdIsString ||
      !cartStructureIsCorrect ||
      !wishlistStructureIsCorrect
    ) {
      console.error(
        "\n❌ IMPORT VALIDATION FAILED."
      );

      console.error(
        "\nExpected:"
      );

      console.error(
        "   users._id      → String"
      );

      console.error(
        "   products._id   → String"
      );

      console.error(
        "   carts.user     → String"
      );

      console.error(
        "   wishlists.user → String"
      );

      console.error(
        "\nDo NOT deploy/test Render yet."
      );

      process.exitCode = 1;

      return;
    }

    // ========================================================
    // SUCCESS
    // ========================================================

    console.log("\n==============================================");
    console.log("✅ IMPORT COMPLETED SUCCESSFULLY");
    console.log("==============================================\n");

    console.log(
      `Database: ${DB_NAME}`
    );

    console.log(
      "\nVerified:"
    );

    console.log(
      "✅ Users _id: String"
    );

    console.log(
      "✅ Products _id: String"
    );

    console.log(
      "✅ Carts use: user"
    );

    console.log(
      "✅ Wishlists use: user"
    );

    console.log(
      "\nYou can now check the Atlas collections in MongoDB Compass.\n"
    );
  } catch (error) {
    console.error(
      "\n❌ IMPORT FAILED\n"
    );

    console.error(error);

    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();

      console.log(
        "🔌 Atlas connection closed."
      );
    }
  }
}

// ============================================================
// RUN
// ============================================================

importDatabase();