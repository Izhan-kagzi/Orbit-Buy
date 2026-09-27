import { loadStripe } from "@stripe/stripe-js";

// Loaded once and reused everywhere Elements is mounted, per Stripe's guidance.
// Set VITE_STRIPE_PUBLIC_KEY in frontend/.env to a test publishable key
// (pk_test_...) from https://dashboard.stripe.com/test/apikeys
let stripePromise;
export function getStripe() {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}
