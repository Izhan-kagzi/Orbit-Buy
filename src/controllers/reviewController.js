const fs = require("fs");
const path = require("path");

// ============================================================
// DB.JSON LOCATION
// ============================================================

// Change this only if your db.json is somewhere else.
//
// Expected structure:
//
// {
//   "users": [],
//   "products": [],
//   "reviews": [],
//   ...
// }

const DB_PATH = path.join(__dirname, "../../db.json");

// ============================================================
// READ DATABASE
// ============================================================

const readDB = () => {
try {
if (!fs.existsSync(DB_PATH)) {
return {
users: [],
products: [],
reviews: [],
};
}

```
const data = fs.readFileSync(DB_PATH, "utf8");

if (!data.trim()) {
  return {
    users: [],
    products: [],
    reviews: [],
  };
}

const db = JSON.parse(data);

// Make sure required arrays exist
if (!Array.isArray(db.users)) {
  db.users = [];
}

if (!Array.isArray(db.products)) {
  db.products = [];
}

if (!Array.isArray(db.reviews)) {
  db.reviews = [];
}

return db;
```

} catch (error) {
console.error("Error reading db.json:", error);
throw new Error("Unable to read database.");
}
};

// ============================================================
// WRITE DATABASE
// ============================================================

const writeDB = (db) => {
try {
fs.writeFileSync(
DB_PATH,
JSON.stringify(db, null, 2),
"utf8"
);
} catch (error) {
console.error("Error writing db.json:", error);
throw new Error("Unable to save database.");
}
};

// ============================================================
// GENERATE ID
// ============================================================

const generateId = (items) => {
if (!items.length) {
return 1;
}

const numericIds = items
.map((item) => Number(item.id))
.filter((id) => Number.isFinite(id));

if (!numericIds.length) {
return Date.now();
}

return Math.max(...numericIds) + 1;
};

// ============================================================
// GET USER ID
// ============================================================

const getUserId = (req) => {
return (
req.user?.id ??
req.user?.userId ??
req.user?._id ??
null
);
};

// ============================================================
// GET USER
// ============================================================

const getUserById = (db, userId) => {
return db.users.find(
(user) =>
String(user.id) === String(userId)
);
};

// ============================================================
// GET PRODUCT
// ============================================================

const getProductById = (db, productId) => {
return db.products.find(
(product) =>
String(product.id) === String(productId)
);
};

// ============================================================
// GET PRODUCT REVIEWS
// GET /api/reviews/product/:productId
// PUBLIC
// ============================================================

const getProductReviews = async (req, res, next) => {
try {
const { productId } = req.params;

```
if (!productId) {
  return res.status(400).json({
    success: false,
    message: "Product ID is required.",
  });
}

const db = readDB();

const product = getProductById(
  db,
  productId
);

if (!product) {
  return res.status(404).json({
    success: false,
    message: "Product not found.",
  });
}

const reviews = db.reviews
  .filter(
    (review) =>
      String(review.productId ?? review.product_id) ===
      String(productId) &&
      (
        review.approved === true ||
        review.approved === 1
      )
  )
  .map((review) => {
    const user = getUserById(
      db,
      review.userId ?? review.user_id
    );

    return {
      ...review,

      productId:
        review.productId ??
        review.product_id,

      userId:
        review.userId ??
        review.user_id,

      userName:
        review.userName ??
        user?.name ??
        user?.username ??
        "Customer",

      userEmail:
        review.userEmail ??
        user?.email ??
        "",
    };
  })
  .sort(
    (a, b) =>
      new Date(b.createdAt ?? b.created_at ?? 0) -
      new Date(a.createdAt ?? a.created_at ?? 0)
  );

return res.status(200).json({
  success: true,
  count: reviews.length,
  reviews,
});
```

} catch (error) {
next(error);
}
};

// ============================================================
// GET ALL REVIEWS
// GET /api/reviews
// ADMIN / MANAGER
// ============================================================

const getAllReviews = async (req, res, next) => {
try {
const db = readDB();

```
const reviews = db.reviews
  .map((review) => {
    const user = getUserById(
      db,
      review.userId ?? review.user_id
    );

    const product = getProductById(
      db,
      review.productId ?? review.product_id
    );

    return {
      ...review,

      productId:
        review.productId ??
        review.product_id,

      userId:
        review.userId ??
        review.user_id,

      productName:
        review.productName ??
        product?.name ??
        product?.title ??
        "Product",

      userName:
        review.userName ??
        user?.name ??
        user?.username ??
        "Customer",

      userEmail:
        review.userEmail ??
        user?.email ??
        "",

      approved:
        review.approved === true ||
        review.approved === 1,
    };
  })
  .sort(
    (a, b) =>
      new Date(b.createdAt ?? b.created_at ?? 0) -
      new Date(a.createdAt ?? a.created_at ?? 0)
  );

return res.status(200).json({
  success: true,
  count: reviews.length,
  reviews,
});
```

} catch (error) {
next(error);
}
};

// ============================================================
// CREATE REVIEW
// POST /api/reviews
// CUSTOMER
// ============================================================

const createReview = async (req, res, next) => {
try {
const userId = getUserId(req);

```
const {
  productId,
  product_id,
  rating,
  comment,
} = req.body;

const finalProductId =
  productId ?? product_id;

if (!userId) {
  return res.status(401).json({
    success: false,
    message: "Authentication required.",
  });
}

if (!finalProductId) {
  return res.status(400).json({
    success: false,
    message: "Product ID is required.",
  });
}

const numericRating = Number(rating);

if (
  !Number.isFinite(numericRating) ||
  numericRating < 1 ||
  numericRating > 5
) {
  return res.status(400).json({
    success: false,
    message: "Rating must be between 1 and 5.",
  });
}

if (
  !comment ||
  !String(comment).trim()
) {
  return res.status(400).json({
    success: false,
    message: "Review comment is required.",
  });
}

const db = readDB();

// Check product
const product = getProductById(
  db,
  finalProductId
);

if (!product) {
  return res.status(404).json({
    success: false,
    message: "Product not found.",
  });
}

// Check duplicate review
const existingReview =
  db.reviews.find(
    (review) =>
      String(
        review.productId ??
        review.product_id
      ) === String(finalProductId) &&
      String(
        review.userId ??
        review.user_id
      ) === String(userId)
  );

if (existingReview) {
  return res.status(409).json({
    success: false,
    message:
      "You have already reviewed this product.",
  });
}

const user = getUserById(
  db,
  userId
);

const now = new Date().toISOString();

const review = {
  id: generateId(db.reviews),

  productId: finalProductId,

  userId: userId,

  rating: numericRating,

  comment: String(comment).trim(),

  approved: false,

  reply: null,

  replyBy: null,

  replyAt: null,

  userName:
    user?.name ??
    user?.username ??
    "Customer",

  userEmail:
    user?.email ??
    "",

  productName:
    product.name ??
    product.title ??
    "Product",

  createdAt: now,

  updatedAt: now,
};

db.reviews.push(review);

writeDB(db);

return res.status(201).json({
  success: true,
  message:
    "Review submitted successfully and is awaiting approval.",
  review,
});
```

} catch (error) {
next(error);
}
};

// ============================================================
// REPLY TO REVIEW
// PUT /api/reviews/:id/reply
// ADMIN / MANAGER
// ============================================================

const replyToReview = async (req, res, next) => {
try {
const { id } = req.params;

```
const {
  reply,
  response,
  message,
} = req.body;

const finalReply =
  reply ??
  response ??
  message;

const staffId = getUserId(req);

if (!id) {
  return res.status(400).json({
    success: false,
    message: "Review ID is required.",
  });
}

if (
  !finalReply ||
  !String(finalReply).trim()
) {
  return res.status(400).json({
    success: false,
    message: "Reply message is required.",
  });
}

const db = readDB();

const review = db.reviews.find(
  (item) =>
    String(item.id) === String(id)
);

if (!review) {
  return res.status(404).json({
    success: false,
    message: "Review not found.",
  });
}

const now = new Date().toISOString();

review.reply =
  String(finalReply).trim();

review.replyBy =
  staffId;

review.replyAt =
  now;

review.updatedAt =
  now;

writeDB(db);

return res.status(200).json({
  success: true,
  message: "Reply added successfully.",
  review,
});
```

} catch (error) {
next(error);
}
};

// ============================================================
// DELETE REPLY
// DELETE /api/reviews/:id/reply
// ADMIN / MANAGER
// ============================================================

const deleteReply = async (req, res, next) => {
try {
const { id } = req.params;

```
if (!id) {
  return res.status(400).json({
    success: false,
    message: "Review ID is required.",
  });
}

const db = readDB();

const review = db.reviews.find(
  (item) =>
    String(item.id) === String(id)
);

if (!review) {
  return res.status(404).json({
    success: false,
    message: "Review not found.",
  });
}

review.reply = null;
review.replyBy = null;
review.replyAt = null;
review.updatedAt =
  new Date().toISOString();

writeDB(db);

return res.status(200).json({
  success: true,
  message:
    "Reply deleted successfully.",
  review,
});
```

} catch (error) {
next(error);
}
};

// ============================================================
// DELETE REVIEW
// DELETE /api/reviews/:id
// ADMIN / MANAGER
// ============================================================

const deleteReview = async (req, res, next) => {
try {
const { id } = req.params;

```
if (!id) {
  return res.status(400).json({
    success: false,
    message: "Review ID is required.",
  });
}

const db = readDB();

const reviewIndex =
  db.reviews.findIndex(
    (item) =>
      String(item.id) === String(id)
  );

if (reviewIndex === -1) {
  return res.status(404).json({
    success: false,
    message: "Review not found.",
  });
}

db.reviews.splice(
  reviewIndex,
  1
);

writeDB(db);

return res.status(200).json({
  success: true,
  message:
    "Review deleted successfully.",
});
```

} catch (error) {
next(error);
}
};

// ============================================================
// APPROVE REVIEW
// PUT /api/reviews/:id/approve
// ADMIN / MANAGER
// ============================================================

const approveReview = async (req, res, next) => {
try {
const { id } = req.params;

```
if (!id) {
  return res.status(400).json({
    success: false,
    message: "Review ID is required.",
  });
}

const db = readDB();

const review = db.reviews.find(
  (item) =>
    String(item.id) === String(id)
);

if (!review) {
  return res.status(404).json({
    success: false,
    message: "Review not found.",
  });
}

review.approved = true;

review.updatedAt =
  new Date().toISOString();

writeDB(db);

return res.status(200).json({
  success: true,
  message:
    "Review approved successfully.",
  review,
});
```

} catch (error) {
next(error);
}
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
getProductReviews,
getAllReviews,
createReview,
replyToReview,
deleteReply,
deleteReview,
approveReview,
};
