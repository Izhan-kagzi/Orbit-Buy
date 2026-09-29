const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

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

const {
  errorHandler,
  notFound,
} = require("./middleware/errorHandler");

const maintenanceGate = require("./middleware/maintenanceGate");

const app = express();

/*
============================================================
CORS
============================================================
*/

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
      /*
      --------------------------------------------------------
      Requests without Origin
      --------------------------------------------------------

      Allows:
      - Postman
      - server-to-server requests
      - health checks
      */

      if (!origin) {
        return callback(null, true);
      }

      /*
      --------------------------------------------------------
      Explicit allowed origins
      --------------------------------------------------------
      */

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      /*
      --------------------------------------------------------
      Allow any localhost / 127.0.0.1 development port
      --------------------------------------------------------
      */

      if (
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
          origin
        )
      ) {
        return callback(null, true);
      }

      console.warn(
        `CORS blocked origin: ${origin}`
      );

      /*
      Do not throw here.

      Returning false prevents the CORS headers from
      being added without turning the request into an
      opaque server-side 500.
      */

      return callback(null, false);
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

/*
============================================================
BODY PARSERS
============================================================
*/

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

/*
============================================================
STATIC UPLOAD DIRECTORIES
============================================================
*/

const PUBLIC_DIR = path.join(
  __dirname,
  "..",
  "public"
);

const UPLOADS_DIR = path.join(
  PUBLIC_DIR,
  "uploads"
);

const PRODUCT_UPLOADS_DIR = path.join(
  UPLOADS_DIR,
  "products"
);

const LEGACY_CUSTOM_UPLOADS_DIR = path.join(
  UPLOADS_DIR,
  "custom"
);

const PROFILE_UPLOADS_DIR = path.join(
  UPLOADS_DIR,
  "profiles"
);

/*
============================================================
ENSURE UPLOAD DIRECTORIES EXIST
============================================================
*/

[
  PUBLIC_DIR,
  UPLOADS_DIR,
  PRODUCT_UPLOADS_DIR,
  LEGACY_CUSTOM_UPLOADS_DIR,
  PROFILE_UPLOADS_DIR,
].forEach((directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }
});

/*
============================================================
STATIC FILE SERVING
============================================================

Product media:

Physical location:

public/uploads/products/

Browser URL:

/uploads/products/<filename>

Example:

http://localhost:5000/uploads/products/product-123.jpg

Production:

https://orbit-buy.onrender.com/uploads/products/product-123.jpg
============================================================
*/

/*
------------------------------------------------------------
PRODUCT UPLOADS
------------------------------------------------------------
*/

app.use(
  "/uploads/products",
  express.static(PRODUCT_UPLOADS_DIR, {
    maxAge: "7d",
    fallthrough: true,
  })
);

/*
------------------------------------------------------------
LEGACY PRODUCT UPLOADS
------------------------------------------------------------

Older versions of Orbit Buy may have stored product
files inside:

public/uploads/custom/

Keep those files accessible through:

/uploads/products/<filename>
------------------------------------------------------------
*/

app.use(
  "/uploads/products",
  express.static(
    LEGACY_CUSTOM_UPLOADS_DIR,
    {
      maxAge: "7d",
      fallthrough: true,
    }
  )
);

/*
------------------------------------------------------------
GENERAL UPLOADS
------------------------------------------------------------

This keeps these URLs available:

/uploads/profiles/...
/uploads/custom/...
/uploads/products/...
------------------------------------------------------------
*/

app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    maxAge: "7d",
    fallthrough: true,
  })
);

/*
============================================================
LOGGER
============================================================
*/

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

/*
============================================================
HEALTH CHECK
============================================================
*/

app.get(
  "/api/health",
  (req, res) => {
    const dbUp = isConnected();

    res.status(
      dbUp ? 200 : 503
    ).json({
      success: dbUp,

      message: dbUp
        ? "Orbit Buy API is running."
        : "Orbit Buy API is running, but MongoDB is not connected.",

      database: dbUp
        ? "connected"
        : "disconnected",

      timestamp:
        new Date().toISOString(),
    });
  }
);

/*
============================================================
MAINTENANCE MODE
============================================================
*/

/*
The maintenance gate is applied to API routes below.

The middleware itself controls which routes remain available
during maintenance, such as:

- health
- maintenance status
- staff authentication
============================================================
*/

app.use(maintenanceGate);

/*
============================================================
API ROUTES
============================================================
*/

app.use(
  "/api/settings",
  settingsRoutes
);

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

/*
Alias for clients using the plural endpoint.
*/

app.use(
  "/api/flash-sales",
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

app.use(
  "/api/reviews",
  reviewRoutes
);

/*
============================================================
404 + ERROR HANDLING
============================================================
*/

app.use(notFound);

app.use(errorHandler);

/*
============================================================
EXPORT
============================================================
*/

module.exports = app;