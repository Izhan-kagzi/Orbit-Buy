// ============================================================
// Orbit Buy - Import db.json → MongoDB Atlas
// File: backend/importDbToAtlas.js
// ============================================================

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

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
    "\nATLAS_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/orbit_buy?retryWrites=true&w=majority"
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
 * Recursively converts MongoDB Extended JSON into the
 * representation expected by the Orbit Buy Mongoose schemas.
 *
 * Important:
 *
 * { "$oid": "abc123..." }
 *
 * becomes:
 *
 * "abc123..."
 *
 * This is required because Orbit Buy uses String IDs.
 */
function convertMongoValues(value) {
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

      // "$date": "2026-01-01T00:00:00.000Z"
      if (typeof dateValue === "string") {
        const date = new Date(dateValue);

        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }

      // "$date": 1234567890000
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
 * Converts known date strings into JavaScript Date objects.
 *
 * This is kept in addition to $date handling because your
 * db.json may contain ordinary ISO date strings.
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
 * Full document normalization.
 */
function normalizeDocument(document) {
  const mongoConverted = convertMongoValues(document);

  return convertDates(mongoConverted);
}

/**
 * Ensures IDs that should be strings are actually strings.
 *
 * We intentionally do NOT generate new IDs here.
 * Existing db.json IDs are preserved.
 */
function normalizeStringId(document) {
  if (!document || typeof document !== "object") {
    return document;
  }

  const result = {
    ...document,
  };

  if (
    result._id !== undefined &&
    result._id !== null
  ) {
    result._id = String(result._id);
  }

  if (
    result.id !== undefined &&
    result.id !== null
  ) {
    result.id = String(result.id);
  }

  return result;
}

/**
 * Normalize a normal collection.
 */
function normalizeCollectionDocuments(documents) {
  return documents.map((document) => {
    const normalized = normalizeDocument(document);

    return normalizeStringId(normalized);
  });
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
        const documents = Object.entries(
          sourceData
        ).map(([userId, items]) => {
          return {
            userId: String(userId),

            items: normalizeDocument(items),
          };
        });

        const collection =
          db.collection(collectionName);

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
      console.log(
        "👤 User sample:"
      );

      console.log(
        "   _id:",
        sampleUser._id
      );

      console.log(
        "   _id type:",
        typeof sampleUser._id
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
      console.log(
        "\n🛍️ Product sample:"
      );

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
      "\nExpected ID type:"
    );

    console.log(
      "Users:    String"
    );

    console.log(
      "Products: String"
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