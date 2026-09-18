// ============================================================
// ORBIT BUY BACKEND — SERVER
// ============================================================

// Load environment variables before anything else reads them.
require("dotenv").config();

const app = require("./src/app");
const { connectDB, disconnectDB } = require("./src/config/db");

const PORT = process.env.PORT || 5000;

let server;

// ============================================================
// START SERVER
// ============================================================

async function start() {
  try {
    // ----------------------------------------------------------
    // Connect to MongoDB before starting HTTP server
    // ----------------------------------------------------------
    await connectDB();

    console.log("✅ MongoDB connected successfully");

    // ----------------------------------------------------------
    // Start Express server
    // ----------------------------------------------------------
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log("==============================================");
      console.log("🛒 Orbit Buy API");
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Local: http://localhost:${PORT}`);
      console.log("==============================================");
    });
  } catch (error) {
    console.error(
      "❌ Startup aborted: could not connect to MongoDB."
    );

    console.error(error);

    process.exit(1);
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal) {
  console.log(`\n⚠️ ${signal} received. Shutting down...`);

  try {
    // ----------------------------------------------------------
    // Stop accepting new HTTP requests
    // ----------------------------------------------------------
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log("✅ HTTP server closed");
    }

    // ----------------------------------------------------------
    // Disconnect MongoDB
    // ----------------------------------------------------------
    await disconnectDB();

    console.log("✅ MongoDB connection closed");
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
  } finally {
    process.exit(0);
  }
}

// ============================================================
// PROCESS SIGNALS
// ============================================================

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

// ============================================================
// ERROR HANDLING
// ============================================================

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:");

  console.error(reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:");

  console.error(error);

  process.exit(1);
});

// ============================================================
// START APPLICATION
// ============================================================

start();