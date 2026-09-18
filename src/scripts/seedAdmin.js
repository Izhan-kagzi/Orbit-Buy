/**
 * Creates (or resets) the default admin account.
 *
 *   node src/scripts/seedAdmin.js
 *   ADMIN_EMAIL=me@shop.com ADMIN_PASSWORD=Secret123 node src/scripts/seedAdmin.js
 */

require("dotenv").config();

const bcrypt = require("bcryptjs");

const { connectDB, disconnectDB } = require("../config/db");
const User = require("../models/User");
const Cart = require("../models/Cart");
const Wishlist = require("../models/Wishlist");

async function run() {
  await connectDB();

  const email = (process.env.ADMIN_EMAIL || "admin@orbitbuy.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin@123";
  const hashed = await bcrypt.hash(password, 10);

  const existing = await User.findOne({ email });

  if (existing) {
    existing.password = hashed;
    existing.role = "admin";
    await existing.save();
    console.log(`✓ Admin password reset for ${email}`);
  } else {
    const admin = await User.create({
      name: "Orbit Buy Admin",
      email,
      password: hashed,
      role: "admin",
    });

    await Promise.all([
      Cart.create({ user: admin._id, items: [] }),
      Wishlist.create({ user: admin._id, products: [] }),
    ]);

    console.log(`✓ Admin account created: ${email}`);
  }

  console.log(`  password: ${password}  — change this after logging in.`);

  await disconnectDB();
}

run().catch(async (error) => {
  console.error("❌ Failed:", error.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
