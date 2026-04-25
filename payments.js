const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const Stripe = require('stripe');
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('[Payments] STRIPE_SECRET_KEY missing. Payment features will be disabled.');
}

const PRICE_ID = process.env.STRIPE_PRICE_ID;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// Check if today is Sunday (free premium day)
function isSunday() {
  return new Date().getDay() === 0;
}

// Check if user has premium access (paid OR Sunday)
async function hasPremium(userId) {
  // Admins always have premium
  try {
    const user = await db.one("SELECT role FROM users WHERE id=$1", [userId]);
    if (user.role === 'admin') return true;
  } catch(e) {}
  if (isSunday()) return true;
  const user = await db.oneOrNone("SELECT is_premium, premium_until FROM users WHERE id=$1", [userId]);
  if (!user) return false;
  if (!user.is_premium) return false;
  if (user.premium_until && new Date(user.premium_until) < new Date()) {
    await db.query("UPDATE users SET is_premium=false WHERE id=$1", [userId]);
    return false;
  }
  return true;
}

// GET /api/payments/status — check premium status
router.get("/status", authenticate, async (req, res, next) => {
  try {
    const premium = await hasPremium(req.user.id);
    const user = await db.one("SELECT is_premium, premium_until, stripe_customer_id FROM users WHERE id=$1", [req.user.id]);
    res.json({
      isPremium: premium,
      isSunday: isSunday(),
      premiumUntil: user.premium_until,
      hasSubscription: !!user.stripe_customer_id,
    });
  } catch (err) { next(err); }
});

// POST /api/payments/create-checkout — start Stripe checkout
router.post("/create-checkout", authenticate, async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Payments disabled" });
    const user = await db.one("SELECT * FROM users WHERE id=$1", [req.user.id]);

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await db.query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2", [customerId, user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      mode: "subscription",
      success_url: `${CLIENT_URL}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/premium`,
      metadata: { userId: user.id },
    });

    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// POST /api/payments/cancel — cancel subscription
router.post("/cancel", authenticate, async (req, res, next) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Payments disabled" });
    const user = await db.one("SELECT stripe_customer_id, stripe_subscription_id FROM users WHERE id=$1", [req.user.id]);
    if (!user.stripe_subscription_id) return res.status(400).json({ error: "No active subscription" });

    await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    res.json({ message: "Subscription will cancel at end of billing period." });
  } catch (err) { next(err); }
});

// POST /api/payments/webhook — Stripe webhook
router.post("/webhook", require('express').raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Payments disabled" });
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata.userId;
      const subscriptionId = session.subscription;
      const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db.query(
        "UPDATE users SET is_premium=true, premium_until=$1, stripe_subscription_id=$2 WHERE id=$3",
        [until, subscriptionId, userId]
      );
      console.log(`[Stripe] Premium activated for user ${userId}`);
    }

    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.query(
        "UPDATE users SET is_premium=true, premium_until=$1 WHERE stripe_customer_id=$2",
        [until, customerId]
      );
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'invoice.payment_failed') {
      const obj = event.data.object;
      const customerId = obj.customer;
      await db.query(
        "UPDATE users SET is_premium=false, stripe_subscription_id=NULL WHERE stripe_customer_id=$1",
        [customerId]
      );
      console.log(`[Stripe] Premium cancelled for customer ${customerId}`);
    }
  } catch (err) {
    console.error("Webhook handler error:", err.message);
  }

  res.json({ received: true });
});

module.exports = { router, hasPremium, isSunday };
