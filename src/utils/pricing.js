const TAX_RATE = 0.05;
const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_CHARGE = 99;

// Single source of truth for order totals — used by both the
// Stripe PaymentIntent creation and the final order placement, so
// the amount a customer is charged always matches the amount their
// order actually records. Never duplicate this math elsewhere.
function calculateTotals(subtotal, discount = 0) {
  const shipping = subtotal > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_CHARGE;
  const tax = Number((subtotal * TAX_RATE).toFixed(2));
  const total = Number((subtotal + shipping + tax - discount).toFixed(2));

  return { shipping, tax, total };
}

module.exports = {
  TAX_RATE,
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_CHARGE,
  calculateTotals,
};
