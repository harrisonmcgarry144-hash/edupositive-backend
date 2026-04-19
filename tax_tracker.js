// Tax tracker - calculates 33% of Stripe revenue for tax savings
const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  next();
}

// GET /api/admin/revenue — total revenue, 33% tax set-aside, net
router.get("/revenue", authenticate, requireAdmin, async (req, res, next) => {
  try {
    // Get all successful charges from Stripe
    let totalGross = 0;
    let totalFees = 0;
    let count = 0;
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const charges = await stripe.charges.list(params);

      for (const charge of charges.data) {
        if (charge.paid && !charge.refunded) {
          totalGross += charge.amount;
          if (charge.balance_transaction) {
            try {
              const bt = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
              totalFees += bt.fee;
            } catch(e) {}
          }
          count++;
        }
      }
      hasMore = charges.has_more;
      if (hasMore && charges.data.length > 0) startingAfter = charges.data[charges.data.length - 1].id;
    }

    const grossGBP = totalGross / 100;
    const feesGBP = totalFees / 100;
    const netRevenue = grossGBP - feesGBP;
    const taxSetAside = netRevenue * 0.33;
    const availableToSpend = netRevenue - taxSetAside;

    // Monthly breakdown for last 12 months
    const now = new Date();
    const monthly = [];
    for (let i = 11; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      monthly.push({
        month: month.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        start: Math.floor(month.getTime() / 1000),
        end: Math.floor(nextMonth.getTime() / 1000),
        gross: 0,
        count: 0,
      });
    }

    // Re-fetch for monthly breakdown (simplified)
    const recentCharges = await stripe.charges.list({ limit: 100 });
    for (const charge of recentCharges.data) {
      if (charge.paid && !charge.refunded) {
        const chargeMonth = monthly.find(m => charge.created >= m.start && charge.created < m.end);
        if (chargeMonth) {
          chargeMonth.gross += charge.amount / 100;
          chargeMonth.count++;
        }
      }
    }

    res.json({
      grossRevenue: grossGBP,
      stripeFees: feesGBP,
      netRevenue,
      taxSetAside,
      taxRate: 0.33,
      availableToSpend,
      totalCharges: count,
      monthly,
    });
  } catch (err) {
    console.error("Revenue error:", err.message);
    res.json({
      grossRevenue: 0, stripeFees: 0, netRevenue: 0, taxSetAside: 0, taxRate: 0.33,
      availableToSpend: 0, totalCharges: 0, monthly: [],
      error: err.message
    });
  }
});

module.exports = router;
