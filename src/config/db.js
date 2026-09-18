const mongoose = require("mongoose");

/**
 * MongoDB connection.
 *
 * The project previously used a db.json file as its "database". Every
 * collection that lived in that file now has a real Mongoose model in
 * src/models, and the old JSON file is only kept around as a one-time
 * migration source (see src/scripts/migrate.js).
 */

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/orbit_buy";

// Fail fast instead of buffering queries forever when Mongo is down.
mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false);

let connectionPromise = null;

async function connectDB() {
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose
    .connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    })
    .then((conn) => {
      console.log(
        `✅ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`
      );
      return conn;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error("❌ MongoDB connection failed:", error.message);
      console.error(
        "   Check that MongoDB is running and MONGO_URI in backend/.env is correct."
      );
      throw error;
    });

  return connectionPromise;
}

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected.");
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected.");
});

async function disconnectDB() {
  connectionPromise = null;
  await mongoose.connection.close();
}

function isConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, disconnectDB, isConnected, mongoose, MONGO_URI };
