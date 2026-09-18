/**
 * One-time migration: db.json  ->  MongoDB.
 *
 * Reads the legacy JSON "database" (src/data/db.json) and writes every
 * collection into MongoDB through the Mongoose models. Safe to re-run:
 * documents are upserted by their original id, so ids stay stable and
 * nothing is duplicated.
 *
 *   npm run db:migrate              # migrate db.json
 *   npm run db:migrate -- --fresh   # wipe the collections first
 *   npm run db:migrate -- --file=/path/to/other.json
 *
 * Run with: node src/scripts/migrate.js
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const { connectDB, disconnectDB, MONGO_URI } = require("../config/db");
const {
  User,
  Product,
  Cart,
  Wishlist,
  Order,
  Coupon,
  Review,
  FlashSale,
} = require("../models");

const args = process.argv.slice(2);
const FRESH = args.includes("--fresh");
const fileArg = args.find((a) => a.startsWith("--file="));

const DB_PATH = fileArg
  ? path.resolve(fileArg.slice("--file=".length))
  : path.join(__dirname, "..", "data", "db.json");

const SEED_PRODUCTS_PATH = path.join(
  __dirname,
  "..",
  "data",
  "products.seed.json"
);

const VALID_SLUGS = Product.VALID_SLUGS;

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`  ! Could not read ${filePath}: ${error.message}`);
    return fallback;
  }
}

function toDate(value, fallback = new Date()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function upsertMany(Model, docs, label) {
  if (docs.length === 0) {
    console.log(`  · ${label}: nothing to migrate`);
    return 0;
  }

  const operations = docs.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: doc },
      upsert: true,
    },
  }));

  const result = await Model.bulkWrite(operations, { ordered: false });
  const written = (result.upsertedCount || 0) + (result.modifiedCount || 0);

  console.log(
    `  ✓ ${label}: ${docs.length} processed (${result.upsertedCount || 0} new, ${
      result.modifiedCount || 0
    } updated)`
  );

  return written;
}

/* ============================================================
   MAPPERS — legacy record -> Mongoose document
============================================================ */

function mapUser(user) {
  return {
    _id: String(user.id),
    name: user.name || "Customer",
    email: String(user.email || "").toLowerCase(),
    password: user.password,
    mobile: user.mobile || "",
    role: ["admin", "manager", "customer"].includes(user.role)
      ? user.role
      : "customer",
    createdAt: toDate(user.createdAt),
    updatedAt: toDate(user.updatedAt, toDate(user.createdAt)),
  };
}

function mapProduct(product) {
  const images = [
    ...new Set(
      [
        ...(Array.isArray(product.images) ? product.images : []),
        product.image,
      ].filter(Boolean)
    ),
  ];

  return {
    _id: String(product.id),
    slug: VALID_SLUGS.includes(product.slug) ? product.slug : VALID_SLUGS[0],
    name: product.name || "Product",
    brand: product.brand || "OrbitBuy",
    category: ["Men", "Women"].includes(product.category)
      ? product.category
      : "Men",
    type: product.type ?? null,
    description: product.description || "",
    sizes: Array.isArray(product.sizes) ? product.sizes : ["S", "M", "L", "XL"],
    price: Number(product.price) || 0,
    oldPrice:
      product.oldPrice === undefined || product.oldPrice === null
        ? null
        : Number(product.oldPrice),
    rating: Number(product.rating) || 4.5,
    reviews: Number(product.reviews) || 0,
    stock: Number(product.stock) || 0,
    isBestSeller: Boolean(product.isBestSeller),
    isNewArrival: Boolean(product.isNewArrival),
    image: product.image || images[0] || null,
    images,
    videos: Array.isArray(product.videos) ? product.videos : [],
    createdAt: toDate(product.createdAt),
    updatedAt: toDate(product.updatedAt, toDate(product.createdAt)),
  };
}

function mapOrder(order) {
  const items = (order.items || []).map((item) => ({
    ...item,
    id: String(item.id),
    quantity: Number(item.quantity) || 1,
    lineTotal:
      Number(item.lineTotal) ||
      Number(item.price) * (Number(item.quantity) || 1),
  }));

  const cancellation = order.cancellation || {};

  return {
    _id: String(order.id),
    userId: String(order.userId),
    items,
    subtotal: Number(order.subtotal) || 0,
    shipping: Number(order.shipping) || 0,
    tax: Number(order.tax) || 0,
    discount: Number(order.discount) || 0,
    total: Number(order.total) || 0,
    couponCode: order.couponCode || null,
    paymentMethod: ["cod", "card", "upi", "netbanking"].includes(
      order.paymentMethod
    )
      ? order.paymentMethod
      : "cod",
    paymentIntentId: order.paymentIntentId || null,
    paymentStatus: ["Pending", "Paid", "Refunded", "Failed"].includes(
      order.paymentStatus
    )
      ? order.paymentStatus
      : "Pending",
    shippingAddress: order.shippingAddress || {},
    status: [
      "Confirmed",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
    ].includes(order.status)
      ? order.status
      : "Confirmed",
    cancellation: {
      status: cancellation.status || null,
      reason: cancellation.reason || null,
      requestedAt: cancellation.requestedAt
        ? toDate(cancellation.requestedAt)
        : null,
      resolvedAt: cancellation.resolvedAt
        ? toDate(cancellation.resolvedAt)
        : null,
      resolvedBy: cancellation.resolvedBy || null,
    },
    createdAt: toDate(order.createdAt),
    updatedAt: toDate(order.updatedAt, toDate(order.createdAt)),
  };
}

function mapCoupon(coupon) {
  return {
    _id: String(coupon.id),
    code: String(coupon.code || "").toUpperCase(),
    discountType: ["flat", "percent"].includes(coupon.discountType)
      ? coupon.discountType
      : "flat",
    discountValue: Number(coupon.discountValue) || 0,
    maxDiscount:
      coupon.maxDiscount === undefined || coupon.maxDiscount === null
        ? null
        : Number(coupon.maxDiscount),
    startDate: toDate(coupon.startDate),
    endDate: toDate(coupon.endDate, new Date(Date.now() + 31536000000)),
    active: coupon.active !== false,
    createdAt: toDate(coupon.createdAt),
    updatedAt: toDate(coupon.updatedAt, toDate(coupon.createdAt)),
  };
}

function mapReview(review, index) {
  const reply = review.reply
    ? {
        message: String(review.reply),
        repliedBy: review.replyBy || null,
        repliedByName: review.replyByName || "Orbit Buy Team",
        repliedByRole: review.replyByRole || "admin",
        repliedAt: toDate(review.replyAt),
      }
    : null;

  return {
    productId: String(review.productId ?? review.product_id ?? ""),
    userId: String(review.userId ?? review.user_id ?? ""),
    userName: review.userName || "Customer",
    userEmail: review.userEmail || "",
    productName: review.productName || "Product",
    rating: Math.min(5, Math.max(1, Number(review.rating) || 5)),
    comment: String(review.comment || "").trim() || "(no comment)",
    // Legacy reviews were created before moderation defaults changed —
    // publish anything that wasn't explicitly rejected.
    approved: review.approved === false ? false : true,
    verifiedPurchase: Boolean(review.verifiedPurchase),
    reply,
    createdAt: toDate(review.createdAt),
    updatedAt: toDate(review.updatedAt, toDate(review.createdAt)),
  };
}

/* The legacy single flash-sale blob becomes one row in the new
   collection, so nothing configured before the migration is lost. */
function mapFlashSale(flashSale) {
  if (!flashSale || typeof flashSale !== "object") return null;
  if (!flashSale.startTime || !flashSale.endTime) return null;

  return {
    title: flashSale.title || "Flash Sale!",
    description: flashSale.description || "",
    images: Array.isArray(flashSale.images) ? flashSale.images : [],
    discountPercent: flashSale.discountPercent ?? null,
    products: Array.isArray(flashSale.products) ? flashSale.products : [],
    startTime: toDate(flashSale.startTime),
    endTime: toDate(flashSale.endTime),
    active: Boolean(flashSale.active),
    createdBy: flashSale.updatedBy || {},
    updatedBy: flashSale.updatedBy || {},
  };
}

/* ============================================================
   MAIN
============================================================ */

async function migrate() {
  console.log(`\n📦 Migrating db.json → MongoDB`);
  console.log(`   source: ${DB_PATH}`);
  console.log(`   target: ${MONGO_URI}\n`);

  await connectDB();

  if (FRESH) {
    console.log("  ! --fresh: clearing existing collections");
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Cart.deleteMany({}),
      Wishlist.deleteMany({}),
      Order.deleteMany({}),
      Coupon.deleteMany({}),
      Review.deleteMany({}),
      FlashSale.deleteMany({}),
    ]);
  }

  const data = readJson(DB_PATH, null);

  if (!data) {
    console.error(
      `  ! No db.json found at ${DB_PATH}. Running the product seed instead.`
    );
  }

  /* ---- Products (db.json first, seed file as fallback) ---- */
  const rawProducts =
    data?.products?.length > 0
      ? data.products
      : readJson(SEED_PRODUCTS_PATH, []);

  await upsertMany(Product, rawProducts.map(mapProduct), "products");

  /* ---- Users ---- */
  const rawUsers = data?.users || [];
  await upsertMany(User, rawUsers.map(mapUser), "users");

  /* ---- Default admin, if none exists ---- */
  const adminExists = await User.exists({ role: "admin" });

  if (!adminExists) {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@orbitbuy.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123";

    await User.create({
      _id: "admin-seed-user-0001",
      name: "Orbit Buy Admin",
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      mobile: "",
      role: "admin",
    });

    console.log(
      `  ✓ admin account created: ${adminEmail} / ${adminPassword} (change this!)`
    );
  }

  /* ---- Carts (object keyed by userId -> one document per user) ---- */
  const carts = Object.entries(data?.carts || {}).map(([userId, items]) => ({
    _id: `cart-${userId}`,
    user: String(userId),
    items: (Array.isArray(items) ? items : []).map((entry) => ({
      productId: String(entry.productId),
      quantity: Number(entry.quantity) || 1,
    })),
  }));

  await upsertMany(Cart, carts, "carts");

  /* ---- Wishlists ---- */
  const wishlists = Object.entries(data?.wishlists || {}).map(
    ([userId, productIds]) => ({
      _id: `wishlist-${userId}`,
      user: String(userId),
      products: (Array.isArray(productIds) ? productIds : []).map(String),
    })
  );

  await upsertMany(Wishlist, wishlists, "wishlists");

  /* ---- Orders ---- */
  await upsertMany(Order, (data?.orders || []).map(mapOrder), "orders");

  /* ---- Coupons ---- */
  await upsertMany(Coupon, (data?.coupons || []).map(mapCoupon), "coupons");

  /* ---- Reviews (no stable legacy id, so match on product+user) ---- */
  const reviews = (data?.reviews || []).map(mapReview).filter(
    (review) => review.productId && review.userId
  );

  if (reviews.length > 0) {
    const result = await Review.bulkWrite(
      reviews.map((review) => ({
        updateOne: {
          filter: { productId: review.productId, userId: review.userId },
          update: { $set: review },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    console.log(
      `  ✓ reviews: ${reviews.length} processed (${
        result.upsertedCount || 0
      } new, ${result.modifiedCount || 0} updated)`
    );

    // Recompute each product's rating from the reviews just imported.
    const productIds = [...new Set(reviews.map((r) => r.productId))];
    for (const productId of productIds) {
      await Review.syncProductRating(productId);
    }
  } else {
    console.log("  · reviews: nothing to migrate");
  }

  /* ---- Flash sale (legacy single blob -> one collection row) ---- */
  const legacySale = mapFlashSale(data?.flashSale);

  if (legacySale) {
    const exists = await FlashSale.findOne({
      title: legacySale.title,
      startTime: legacySale.startTime,
    });

    if (!exists) {
      await FlashSale.create(legacySale);
      console.log("  ✓ flash sale: legacy sale imported");
    } else {
      console.log("  · flash sale: already imported");
    }
  } else {
    console.log("  · flash sale: nothing to migrate");
  }

  /* ---- Make sure every user has a cart + wishlist ---- */
  const allUsers = await User.find().select("_id").lean();

  await Promise.all(
    allUsers.flatMap((user) => [
      Cart.updateOne(
        { user: user._id },
        { $setOnInsert: { items: [] } },
        { upsert: true }
      ),
      Wishlist.updateOne(
        { user: user._id },
        { $setOnInsert: { products: [] } },
        { upsert: true }
      ),
    ])
  );

  console.log("\n✅ Migration complete.\n");

  const counts = {
    users: await User.countDocuments(),
    products: await Product.countDocuments(),
    orders: await Order.countDocuments(),
    coupons: await Coupon.countDocuments(),
    reviews: await Review.countDocuments(),
    flashSales: await FlashSale.countDocuments(),
    carts: await Cart.countDocuments(),
    wishlists: await Wishlist.countDocuments(),
  };

  console.table(counts);

  await disconnectDB();
}

migrate().catch(async (error) => {
  console.error("\n❌ Migration failed:", error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
