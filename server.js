// Load environment variables from .env before anything else reads them.
require("dotenv").config();

const app = require("./src/app");
const { connectDB, disconnectDB } = require("./src/config/db");

const PORT = process.env.PORT || 5000;

let server;

async function start() {
  try {
    // Connect to MongoDB first — starting the HTTP server before the
    // database is up just produces a wall of failing requests.
    await connectDB();
  } catch (error) {
    console.error(
      "Startup aborted: could not connect to MongoDB. Is mongod running?"
    );
    process.exit(1);
  }

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🛒 Orbit Buy API running on http://localhost:${PORT}`);
  });
}

start();

/* ============================================================
   GRACEFUL SHUTDOWN + CRASH SAFETY
============================================================ */

async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await disconnectDB();
  process.exit(0);
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});
