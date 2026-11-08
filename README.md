# Orbit Buy — Backend API

The REST API that powers **Orbit Buy**, a premium men's and women's fashion storefront. It handles authentication, catalogue and media, carts and wishlists, checkout and payments, order fulfilment with real-time tracking, and a staff back office for admins and managers.

---

## Features

1. **Authentication** — JWT-based sessions with role-based access for customers, managers and admins.
2. **Product catalogue** — men's and women's categories, search, and media stored in MongoDB GridFS.
3. **Reviews** — customer reviews with optional moderation.
4. **Cart and wishlist** — persistent per user and validated against live stock at checkout.
5. **Coupons and flash sales** — discount codes and time-boxed promotions managed by staff.
6. **Checkout and payments** — Stripe card payments verified server-side, plus cash on delivery, UPI and net banking, with automatic tax and shipping calculation.
7. **Order management** — Pending, Confirmed, Processing, Shipped, Delivered and Cancelled, with stock restored on cancellation.
8. **Live order updates and notifications** — customers are notified after checkout and see every status change in real time; tracking closes automatically on delivery or cancellation.
9. **Cancellation workflow** — customers request a cancellation, staff approve or reject it, and refunds are flagged automatically.
10. **AI Stylist** — outfit recommendations grounded in the store's own catalogue.
11. **Staff back office** — admin and manager tools with activity logs.
12. **Maintenance mode** — a store-wide switch that keeps staff access intact.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js |
| Framework | Express |
| Database | MongoDB with Mongoose |
| Authentication | JSON Web Tokens, bcrypt password hashing |
| Payments | Stripe |
| Real-time | Server-Sent Events, Web Push |
| AI | External API Key |
| Uploads | Multer |
| Logging | Morgan |

---

## API Overview

All endpoints are served under the `/api` prefix.

| Area | Purpose |
| --- | --- |
| Auth | Registration, login, session lookup and logout |
| Users | Profile management and staff user administration |
| Products | Catalogue browsing, search and admin product management |
| Flash Sale | Active promotions and their administration |
| Cart | Per-user cart management |
| Wishlist | Per-user saved items |
| Orders | Checkout, order history, live tracking stream, cancellations and staff fulfilment tools |
| Coupons | Coupon validation and administration |
| Payments | Stripe payment intent creation |
| Reviews | Customer reviews and moderation |
| Settings | Store settings and maintenance status |
| AI | AI Stylist recommendations |
| Push | Web Push subscription management |
| Health | Service and database status check |

---

## Roles and Permissions

| Role | Access |
| --- | --- |
| Customer | Browse, purchase, track and request cancellation of their own orders. |
| Manager | Fulfil orders, resolve cancellations and manage day-to-day store operations. Activity is logged. |
| Admin | Full access, including managers, coupons, flash sales, reviews and maintenance mode. |

---

## Project Structure

| Folder | Responsibility |
| --- | --- |
| `config` | Database connection |
| `controllers` | Request handling and business logic |
| `data` | Seed data and import utilities |
| `middleware` | Authentication, uploads, error handling and the maintenance gate |
| `models` | Mongoose schemas |
| `routes` | Route definitions per feature |
| `scripts` | Admin seeding, migration, database reset and maintenance utilities |
| `services` | Live order streaming and push notifications |
| `utils` | Shared helpers such as pricing, JWT and error handling |

---

## Configuration

The server is configured through environment variables.

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string (Atlas URIs are also supported) |
| `JWT_SECRET` | Secret used to sign sessions — required in production |
| `JWT_EXPIRES_IN` | Session lifetime |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins |
| `STRIPE_SECRET_KEY` | Stripe server key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `REVIEW_AUTO_APPROVE` | Publish reviews without moderation |
| `UPLOAD_DIR` | Custom location for uploaded files |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Enable push notifications for live order tracking |

---

## Security

- Passwords are hashed with bcrypt and sessions are signed JWTs.
- Role checks protect every staff-only route.
- Card payments are verified directly with Stripe: the payment must have succeeded, belong to the user, match the exact order total and not have been used before.
- Stock and totals are recalculated on the server; client-supplied prices are never trusted.
- CORS is restricted to configured origins.

---

## Deployment

The API is designed for container-style hosting such as Render, with MongoDB Atlas for data. Set the environment variables above, expose the health endpoint to your platform's health checks, and use a persistent disk or GridFS for uploaded media. Live order tracking runs in a single process; scaling across multiple instances requires a shared message channel.

---

##  Want to this project in your hand

Contact Izhan Kagzi on https://izhankagzi.vercel.app/
