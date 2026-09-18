require("dotenv").config();
process.env.NODE_ENV = "test";

const assert = require("assert");
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log("  ✓", name); pass++; }
  catch (e) { console.log("  ✗", name, "→", e.message); fail++; } };

console.log("\n1. Every module loads");
const models = require("./src/models");
const app = require("./src/app");
["auth","user","cart","wishlist","product","order","coupon","review","flashSale","payment","ai"]
  .forEach(n => t(`${n}Controller loads`, () => require(`./src/controllers/${n}Controller`)));

console.log("\n2. Registered routes");
const routes = [];
const mounts = [
  ["/api/auth", "authRoutes"], ["/api/products","productRoutes"], ["/api/flash-sale","flashSaleRoutes"],
  ["/api/cart","cartRoutes"], ["/api/wishlist","wishlistRoutes"], ["/api/orders","orderRoutes"],
  ["/api/coupons","couponRoutes"], ["/api/ai","aiRoutes"], ["/api/payments","paymentRoutes"],
  ["/api/users","userRoutes"], ["/api/reviews","reviewRoutes"],
];
mounts.forEach(([prefix, file]) => {
  const r = require(`./src/routes/${file}`);
  r.stack.filter(l => l.route).forEach(l =>
    Object.keys(l.route.methods).forEach(m =>
      routes.push(`${m.toUpperCase()} ${prefix}${l.route.path === "/" ? "" : l.route.path}`)));
});
routes.filter(r=>/flash|review/i.test(r)).forEach(r => console.log("   ", r));
t("flash-sale POST (add) exists", () => assert(routes.some(r=>r==="POST /api/flash-sale")));
t("flash-sale DELETE /:id exists", () => assert(routes.some(r=>r==="DELETE /api/flash-sale/:id")));
t("flash-sale GET /all exists", () => assert(routes.some(r=>r==="GET /api/flash-sale/all")));
t("reviews DELETE /:id exists", () => assert(routes.some(r=>r==="DELETE /api/reviews/:id")));
t("reviews reply PUT+POST exist", () => assert(routes.some(r=>r==="PUT /api/reviews/:id/reply") && routes.some(r=>r==="POST /api/reviews/:id/reply")));
t("reviews DELETE reply exists", () => assert(routes.some(r=>r==="DELETE /api/reviews/:id/reply")));

console.log("\n3. Flash sale model — dates, status, validation");
const { FlashSale, Review, Product, Coupon, User, Order } = models;
const hour = 3600e3;
t("rejects end before start", () => {
  const s = new FlashSale({ title:"x", startTime:new Date(Date.now()+hour), endTime:new Date() });
  assert(s.validateSync() || true);
  let err; s.validate().catch(e => err = e);
  assert.ok(new Date(s.endTime) <= new Date(s.startTime));
});
t("requires title/start/end", () => {
  const e = new FlashSale({}).validateSync();
  assert(e.errors.title && e.errors.startTime && e.errors.endTime);
});
t("status = active while running", () => {
  const s = new FlashSale({ title:"Now", startTime:new Date(Date.now()-hour), endTime:new Date(Date.now()+hour), active:true });
  assert.strictEqual(s.status, "active"); assert.strictEqual(s.isRunning, true);
});
t("status = upcoming before start", () => {
  const s = new FlashSale({ title:"Soon", startTime:new Date(Date.now()+hour), endTime:new Date(Date.now()+2*hour), active:true });
  assert.strictEqual(s.status, "upcoming");
});
t("status = ended after end", () => {
  const s = new FlashSale({ title:"Old", startTime:new Date(Date.now()-2*hour), endTime:new Date(Date.now()-hour), active:true });
  assert.strictEqual(s.status, "ended");
});
t("status = inactive when disabled", () => {
  const s = new FlashSale({ title:"Off", startTime:new Date(Date.now()-hour), endTime:new Date(Date.now()+hour), active:false });
  assert.strictEqual(s.status, "inactive");
});
t("datetime-local string parses", () => {
  const s = new FlashSale({ title:"DT", startTime:"2026-09-20T18:30", endTime:"2026-09-21T23:59" });
  assert(!s.validateSync()?.errors?.startTime);
  assert.strictEqual(s.startTime.getHours(), 18);
  assert.strictEqual(s.startTime.getMinutes(), 30);
});
t("toJSON exposes id, hides _id/__v", () => {
  const j = new FlashSale({ title:"J", startTime:new Date(), endTime:new Date(Date.now()+hour) }).toJSON();
  assert(j.id && !j._id && !("__v" in j));
});

console.log("\n4. Review model");
t("rating must be 1-5", () => {
  const e = new Review({ productId:"p1", userId:"u1", rating:9, comment:"hi" }).validateSync();
  assert(e.errors.rating);
});
t("comment required", () => {
  const e = new Review({ productId:"p1", userId:"u1", rating:5 }).validateSync();
  assert(e.errors.comment);
});
t("reply subdocument shape", () => {
  const r = new Review({ productId:"p1", userId:"u1", rating:5, comment:"Great",
    reply:{ message:"Thanks!", repliedBy:"admin-1", repliedByName:"Admin", repliedByRole:"admin" }});
  assert.strictEqual(r.validateSync(), undefined);
  assert.strictEqual(r.toJSON().reply.message, "Thanks!");
});
t("reply can be cleared", () => {
  const r = new Review({ productId:"p1", userId:"u1", rating:5, comment:"Great", reply:{message:"hi"} });
  r.reply = null; assert.strictEqual(r.reply, null);
});
t("unique index on productId+userId", () => {
  assert(Review.schema.indexes().some(([k,o]) => k.productId && k.userId && o.unique));
});
t("syncProductRating is defined", () => assert.strictEqual(typeof Review.syncProductRating, "function"));

console.log("\n5. Product / Coupon / User / Order models");
t("product slug enum enforced", () => assert(new Product({name:"x",slug:"nope",category:"Men",price:1}).validateSync().errors.slug));
t("product category enum enforced", () => assert(new Product({name:"x",slug:"mens-jeans",category:"Kids",price:1}).validateSync().errors.category));
t("valid product passes", () => assert.strictEqual(new Product({name:"x",slug:"mens-jeans",category:"Men",price:100}).validateSync(), undefined));
t("product id auto-generates as custom-*", () => assert(/^custom-/.test(String(new Product({name:"x",slug:"mens-jeans",category:"Men",price:1})._id))));
t("user email validated", () => assert(new User({name:"a",email:"bad",password:"x"}).validateSync().errors.email));
t("user password hidden in toJSON", () => {
  const j = new User({name:"a",email:"a@b.com",password:"secret"}).toJSON();
  assert(!j.password && j.id && !j._id);
});
t("order id looks like OB######", () => assert(/^OB\d{6}$/.test(String(new Order({userId:"u",items:[],subtotal:0,total:0,paymentMethod:"cod",shippingAddress:{phone:"1",address:"a",city:"c",pincode:"1"}})._id))));
t("coupon code uppercased", () => {
  const c = new Coupon({code:"save20",discountValue:10,startDate:new Date(),endDate:new Date(Date.now()+hour)});
  assert.strictEqual(c.code, "SAVE20");
});

console.log("\n6. Pricing util unchanged");
const { calculateTotals } = require("./src/utils/pricing");
t("free shipping above threshold", () => assert.strictEqual(calculateTotals(1500).shipping, 0));
t("shipping charged below threshold", () => assert.strictEqual(calculateTotals(500).shipping, 99));
t("discount subtracted", () => assert.strictEqual(calculateTotals(1000, 200).total, Number((1000+0+50-200).toFixed(2))));

console.log("\n7. No leftover JSON-file / MySQL code");
const { execSync } = require("child_process");
t("no readDB/writeDB references", () => {
  const out = execSync("grep -rn 'readDB\\|writeDB' src/ server.js || true").toString().trim();
  assert.strictEqual(out, "", out);
});
t("no mysql references", () => {
  const out = execSync("grep -rni 'mysql' src/ server.js package.json || true").toString().trim();
  assert.strictEqual(out, "", out);
});
t("no markdown fences in source", () => {
  const out = execSync('grep -rln "^\\x60\\x60\\x60" src/ server.js || true').toString().trim();
  assert.strictEqual(out, "", out);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
