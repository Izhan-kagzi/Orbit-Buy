const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const { isConnected } = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const flashSaleRoutes = require("./routes/flashSaleRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const orderRoutes = require("./routes/orderRoutes");
const couponRoutes = require("./routes/couponRoutes");
const aiRoutes = require("./routes/aiRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const userRoutes = require("./routes/userRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

const { errorHandler, notFound } = require("./middleware/errorHandler");
const maintenanceGate = require("./middleware/maintenanceGate");

const app = express();

// ============================================================
// CORS
// ============================================================

const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "https://orbitbuy.vercel.app",
];

const allowedOrigins = [
  ...new Set(
    [
      ...defaultOrigins,
      ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : []),
    ]
      .map((origin) => origin.trim())
      .filter(Boolean)
  ),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header, such as Postman and
      // server-to-server requests.
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Any localhost port during development.
      if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);

      // Reject without throwing — a thrown error here surfaced as an
      // opaque 500 instead of a clean CORS rejection.
      return callback(null, false);
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ============================================================
// BODY PARSERS
// ============================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================================
// STATIC UPLOADS
// ============================================================

app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "public", "uploads"), {
    maxAge: "7d",
  })
);

// ============================================================
// LOGGER
// ============================================================

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  const dbUp = isConnected();

  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    message: dbUp
      ? "Orbit Buy API is running."
      : "Orbit Buy API is running, but MongoDB is not connected.",
    database: dbUp ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// MAINTENANCE MODE
// ============================================================
// Gate every /api/* request below except the always-allowed list inside
// maintenanceGate itself (health, the maintenance status endpoint, and
// login/me/logout so staff can still sign in and out).

app.use(maintenanceGate);

// ============================================================
// API ROUTES
// ============================================================

app.use("/api/settings", settingsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/flash-sale", flashSaleRoutes);
// Alias — some clients call /api/flash-sales (plural).
app.use("/api/flash-sales", flashSaleRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/reviews", reviewRoutes);

// ============================================================
// 404 + ERROR HANDLING
// ============================================================

app.use(notFound);
app.use(errorHandler);

module.exports = app;