const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const flashSaleRoutes = require("./routes/flashSaleRoutes");
const authRoutes = require("./routes/authRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const orderRoutes = require("./routes/orderRoutes");
const couponRoutes = require("./routes/couponRoutes");
const aiRoutes = require("./routes/aiRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const userRoutes = require("./routes/userRoutes");
const reviewRoutes = require("./routes/reviewRoutes");

const {
  errorHandler,
  notFound,
} = require("./middleware/errorHandler");

const app = express();

// ============================================================
// CORS
// ============================================================

const defaultOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://orbitbuy.vercel.app",
];

const allowedOrigins = [
  ...new Set(
    [
      ...defaultOrigins,
      ...(process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",")
        : []),
    ]
      .map((origin) => origin.trim())
      .filter(Boolean)
  ),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      // such as Postman and server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`CORS blocked origin: ${origin}`);

      return callback(
        new Error("Not allowed by CORS")
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// ============================================================
// BODY PARSER
// ============================================================

app.use(express.json());

// ============================================================
// STATIC UPLOADS
// ============================================================

app.use(
  "/uploads",
  express.static(
    path.join(
      __dirname,
      "..",
      "public",
      "uploads"
    )
  )
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
  res.json({
    success: true,
    message: "Orbit Buy API is running.",
  });
});

// ============================================================
// API ROUTES
// ============================================================

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/products",
  productRoutes
);

app.use(
  "/api/flash-sale",
  flashSaleRoutes
);

app.use(
  "/api/cart",
  cartRoutes
);

app.use(
  "/api/wishlist",
  wishlistRoutes
);

app.use(
  "/api/orders",
  orderRoutes
);

app.use(
  "/api/coupons",
  couponRoutes
);

app.use(
  "/api/ai",
  aiRoutes
);

app.use(
  "/api/payments",
  paymentRoutes
);

app.use(
  "/api/users",
  userRoutes
);

// ============================================================
// REVIEWS
// Public product reviews + Admin/Manager review management
// ============================================================

app.use(
  "/api/reviews",
  reviewRoutes
);

// ============================================================
// 404 + ERROR HANDLING
// ============================================================

app.use(notFound);

app.use(errorHandler);

// ============================================================
// EXPORT APP
// ============================================================

module.exports = app;