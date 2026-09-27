// ============================================================
// Orbit Buy - Import db.json → MongoDB Atlas
// File: backend/importDbToAtlas.js
// ============================================================

const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// ============================================================
// CONFIG
// ============================================================

// IMPORTANT:
// Do NOT put your Atlas password here if this file will be
// committed to GitHub.
//
// Create a .env file with:
// ATLAS_URI=mongodb+srv://USERNAME:PASSWORD@orbit-buy.lb7vjx8.mongodb.net/orbit_buy?retryWrites=true&w=majority&appName=orbit-buy

require("dotenv").config();

const ATLAS_URI = process.env.ATLAS_URI;

const DB_NAME = "orbit_buy";

const JSON_FILE = path.join(__dirname, "db.json");

// Collections that exist in db.json
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
  console.error("\nCreate/update backend/.env with:\n");
  console.error(
    "ATLAS_URI=mongodb+srv://izhankagzi313_db_user:OHXNEAzSXZz8HJnb@cluster0.et7s6hs.mongodb.net/"
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

function convertDates(value) {
  if (Array.isArray(value)) {
    return value.map(convertDates);
  }

  if (value && typeof value === "object") {
    const result = {};

    for (const [key, val] of Object.entries(value)) {
      // Convert known date fields into MongoDB Date objects
      if (
        typeof val === "string" &&
        /^(createdAt|updatedAt|startDate|endDate|requestedAt|resolvedAt)$/.test(
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

    console.log("📂 Reading:", JSON_FILE);

    const rawData = fs.readFileSync(JSON_FILE, "utf8");

    const data = JSON.parse(rawData);

    console.log("✅ db.json loaded successfully.\n");

    // --------------------------------------------------------
    // Connect Atlas
    // --------------------------------------------------------

    console.log("🔌 Connecting to MongoDB Atlas...");

    client = new MongoClient(ATLAS_URI);

    await client.connect();

    console.log("✅ Connected to MongoDB Atlas.\n");

    const db = client.db(DB_NAME);

    console.log(`🗄️ Database: ${DB_NAME}\n`);

    // --------------------------------------------------------
    // Import each collection
    // --------------------------------------------------------

    for (const collectionName of COLLECTIONS) {
      const sourceData = data[collectionName];

      if (sourceData === undefined) {
        console.log(`⚠️ ${collectionName}: not found in db.json`);
        continue;
      }

      // ------------------------------------------------------
      // Special handling for carts/wishlists
      //
      // db.json stores these as:
      //
      // "carts": {
      //   "user-id": [],
      //   "another-user-id": []
      // }
      //
      // MongoDB collection will store them as documents:
      //
      // {
      //   userId: "user-id",
      //   items: []
      // }
      // ------------------------------------------------------

      if (
        collectionName === "carts" ||
        collectionName === "wishlists"
      ) {
        const documents = Object.entries(sourceData).map(
          ([userId, items]) => ({
            userId,
            items: convertDates(items),
          })
        );

        const collection = db.collection(collectionName);

        await collection.deleteMany({});

        if (documents.length > 0) {
          await collection.insertMany(documents);
        }

        console.log(
          `✅ ${collectionName}: imported ${documents.length} documents`
        );

        continue;
      }

      // ------------------------------------------------------
      // Normal array collections
      // ------------------------------------------------------

      if (!Array.isArray(sourceData)) {
        console.log(
          `⚠️ ${collectionName}: expected an array, skipping`
        );

        continue;
      }

      const documents = sourceData.map(convertDates);

      const collection = db.collection(collectionName);

      // Clear existing collection before import
      await collection.deleteMany({});

      if (documents.length > 0) {
        await collection.insertMany(documents);
      }

      console.log(
        `✅ ${collectionName}: imported ${documents.length} documents`
      );
    }

    // --------------------------------------------------------
    // Show final counts
    // --------------------------------------------------------

    console.log("\n==============================================");
    console.log(" Atlas Import Summary");
    console.log("==============================================\n");

    for (const collectionName of COLLECTIONS) {
      const count = await db
        .collection(collectionName)
        .countDocuments();

      console.log(`📦 ${collectionName}: ${count}`);
    }

    console.log("\n==============================================");
    console.log("✅ IMPORT COMPLETED SUCCESSFULLY");
    console.log("==============================================\n");

    console.log(`Database: ${DB_NAME}`);
    console.log("You can now open MongoDB Compass and check Atlas.\n");
  } catch (error) {
    console.error("\n❌ IMPORT FAILED\n");

    console.error(error);

    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
      console.log("🔌 Atlas connection closed.");
    }
  }
}

importDatabase();