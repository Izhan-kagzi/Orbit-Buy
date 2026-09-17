// Load environment variables from .env
require("dotenv").config();

// Import your Express app
const app = require("./src/app");

// Import DB connection test (optional)
const { testConnection } = require("./src/config/mysql");

// Define port (default to 5000 if not set)
const PORT = process.env.PORT || 5000;

// Test database connection once at startup
testConnection();

// Start the server
app.listen(PORT, "0.0.0.0",async () => {
  console.log(`🛒 Orbit Buy API running on http://localhost:${PORT}`);
  try {
    await testConnection();
  } catch (error) {
    console.error("Database connection could not be established.");
  }
});
