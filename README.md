# Orbit Buy — Backend API

A REST API backend for the Orbit Buy storefront: authentication,
product catalog, cart, wishlist, coupons, orders, and an admin product
management API. **The React frontend is fully wired to this API** —
run both together and everything (accounts, cart, wishlist, checkout,
the admin dashboard) is live and persisted.

No external database required — it runs entirely with a local JSON
file (`src/data/db.json`), auto-created and pre-seeded with the same
105 products used on the frontend, plus a seeded admin account. Clone,
`npm install`, `npm start` — that's it.

> Swapping the JSON file for MongoDB/Postgres later only touches
> `src/config/db.js` — every controller talks to `readDB()`/`writeDB()`,
> not to the storage format directly.

## Running the whole project

```bash
# Terminal 1 — backend
cd backend
npm install
cp .env.example .env
npm start          # http://localhost:5000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev         # http://localhost:5173
```

The frontend already has a `.env` pointing `VITE_API_URL` at
`http://localhost:5000/api`. Change it there (and `CORS_ORIGIN` in the
backend's `.env`) if you run either on a different port or host.

On first run the backend creates `src/data/db.json`, seeded from
`src/data/products.seed.json` (105 products) and one admin account.

## Admin login

```
Email:    admin@orbitbuy.com
Password: Admin@123
```

Log in with this account on the site, then open the shield icon in
the navbar (or go to `/admin`) to reach the dashboard. Change this
password (via `PUT /api/auth/me` — or just edit the seed) before using
this anywhere but locally.

From the dashboard you can:
- See store stats (products, orders, users, revenue, low-stock count)
- Browse/search all products, edit or delete any of them
- **Add a new product** — name, brand, category, which store page it
  appears on, description, price/old price, stock, available sizes,
  and a real image upload — it shows up on the site immediately

To wipe all users/carts/orders and start fresh from the seed catalog:

```bash
npm run db:reset
```

## Environment variables (`.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the API listens on | `5000` |
| `JWT_SECRET` | Secret used to sign auth tokens — **change this in production** | dev fallback |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins | `http://localhost:5173` |

## API Reference

All responses are JSON: `{ success: true, ... }` on success, or
`{ success: false, message: "..." }` on error. Routes marked 🔒 require
an `Authorization: Bearer <token>` header (returned from
register/login). Routes marked 🛡️ additionally require an admin
account.

### Auth

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password, mobile? }` → creates a user, returns `{ token, user }` |
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/api/auth/me` 🔒 | Current logged-in user |
| PUT | `/api/auth/me` 🔒 | `{ name?, mobile? }` → update profile |

### Products

| Method | Route | Description |
|---|---|---|
| GET | `/api/products` | List products. Query params: `slug` (page section, see below), `category` (Men/Women), `q` (search), `sort` (`price_asc`/`price_desc`/`rating`), `minPrice`, `maxPrice`, `page`, `limit` |
| GET | `/api/products/:id` | Single product |
| GET | `/api/products/:id/related` | Related products (same category/type) |
| POST | `/api/products` 🛡️ | `multipart/form-data`: `name, brand, category, slug, description, price, oldPrice?, stock, sizes` (comma-separated), `image` (file) → creates a product |
| PUT | `/api/products/:id` 🛡️ | Same fields as above, all optional — partial update. New `image` file replaces the old one. |
| DELETE | `/api/products/:id` 🛡️ | Removes a product |

`slug` is what decides which page/section a product shows up on. Valid
values: `mens-shirts`, `mens-tshirts`, `mens-jeans`, `mens-trackpants`,
`mens-hoodies`, `mens-jackets`, `women-dresses`, `women-partywear`,
`women-jeans`, `women-cordset`, `women-formals`, `best-sellers`,
`new-arrivals`.

Uploaded images are saved to `public/uploads/custom/` and served at
`/uploads/custom/<filename>`.

### Cart 🔒 (all routes require login)

| Method | Route | Description |
|---|---|---|
| GET | `/api/cart` | Current cart, with live prices/line totals |
| POST | `/api/cart` | `{ productId, quantity? }` → add/increment |
| PUT | `/api/cart/:productId` | `{ quantity }` → set exact quantity |
| DELETE | `/api/cart/:productId` | Remove one item |
| DELETE | `/api/cart` | Empty the cart |

Cart entries only ever store `{ productId, quantity }` — prices are
always looked up fresh from the product catalog when the cart is
returned, so a client can never manipulate what it gets charged.

### Wishlist 🔒

| Method | Route | Description |
|---|---|---|
| GET | `/api/wishlist` | Current wishlist (full product objects) |
| POST | `/api/wishlist` | `{ productId }` → add |
| DELETE | `/api/wishlist/:productId` | Remove |

### Coupons 🔒

| Method | Route | Description |
|---|---|---|
| POST | `/api/coupons/apply` | `{ code }` → `{ code, discount }` or 400 if invalid |

Valid demo codes: `WELCOME10` (₹100), `SAVE20` (₹200), `ORBIT50` (₹500)
— matches the codes referenced on the frontend checkout page.

### Orders 🔒

| Method | Route | Description |
|---|---|---|
| POST | `/api/orders` | `{ paymentMethod, couponCode?, shippingAddress }` → validates stock server-side, decrements it, clears the cart, and creates the order |
| GET | `/api/orders` | This user's order history |
| GET | `/api/orders/:id` | Single order (only if it belongs to the requesting user) |
| GET | `/api/orders/admin/all` 🛡️ | Every order across all users |
| GET | `/api/orders/admin/stats` 🛡️ | Dashboard stats: product/order/user counts, revenue, low-stock count |

`paymentMethod` must be one of `cod`, `card`, `upi`, `netbanking`.
`shippingAddress` must include `address`, `city`, `pincode`, `phone`.

Pricing on an order is always: `subtotal` (sum of live product prices
× quantity) + `tax` (5% GST) + `shipping` (₹99, free over ₹999) −
`discount` (from a valid coupon) = `total`. None of this is trusted
from the client — it's all recomputed server-side at order time.

## Example: full flow with curl

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"password123"}'
# → copy the "token" from the response

TOKEN="paste-token-here"

# Add an item to cart
curl -X POST http://localhost:5000/api/cart \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"productId":"msh-1","quantity":2}'

# Place an order
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{
    "paymentMethod":"cod",
    "couponCode":"WELCOME10",
    "shippingAddress":{"address":"123 Main St","city":"Surat","state":"Gujarat","pincode":"395003","phone":"9876543210"}
  }'

# Admin: add a product (as the seeded admin, after logging in above)
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "name=Classic Polo Shirt" -F "brand=OrbitBuy" -F "category=Men" \
  -F "slug=mens-shirts" -F "description=Soft cotton polo." \
  -F "price=1299" -F "stock=30" -F "sizes=S,M,L,XL" \
  -F "image=@/path/to/photo.jpg"
```

## Project structure

```
backend/
├── server.js                 # entry point
├── src/
│   ├── app.js                # Express app + route mounting + static /uploads
│   ├── config/db.js          # JSON-file data layer
│   ├── data/
│   │   ├── products.seed.json   # 105-product catalog (source of truth)
│   │   └── db.json              # runtime data (git-ignored, auto-created)
│   ├── controllers/          # auth, product, cart, wishlist, order, coupon
│   ├── routes/                # one router per resource
│   ├── middleware/            # JWT auth guard, admin guard, upload (multer), error handler
│   ├── utils/                 # jwt, ApiError, asyncHandler
│   └── scripts/resetDb.js     # wipe & reseed
└── public/uploads/           # product images (seeded + admin-uploaded)
```
