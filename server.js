require("dotenv").config();
const express = require("express");
const { router: ranksRouter, updateRanks } = require('./ranks');
const { router: paymentsRouter } = require('./payments');
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cron = require('node-cron');
const { sendDailyRevisionEmails } = require('./daily_email');

const app = express();

// Trust proxy (Render)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CORS — only allow edupositive.xyz and local dev
app.use((req, res, next) => {
  const allowed = [
    'https://edupositive.xyz',
    'https://www.edupositive.xyz',
    'https://edupositive-frontend.vercel.app',
    'http://localhost:3000',
  ];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Global rate limit
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// Socket.io
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ['https://edupositive.xyz', 'http://localhost:3000'], credentials: true },
});
app.set("io", io);
require("./realtime")(io);

// Health check
app.get('/api/health', (req, res) => res.json({ status: "ok", app: "EduPositive", version: "1.0.0" }));

// Stripe webhook (must be before json middleware — raw body needed)
app.use('/api/payments/webhook', require('./payments').router);

// Routes
app.use("/api/auth",         require("./auth"));
app.use("/api/users",        require("./users"));
app.use("/api/content",      require("./content"));
app.use("/api/flashcards",   require("./flashcards_new"));
app.use("/api/ai",           require("./ai"));
app.use("/api/exams",        require("./exams"));
app.use("/api/analytics",    require("./analytics"));
app.use("/api/analytics",    require("./advanced_analytics"));
app.use('/api/gamification', require('./gamification').router);
app.use("/api/social",       require("./social"));
app.use('/api/classes',      require('./classes'));
app.use('/api/generate',     require('./generate_routes'));
app.use("/api/upload",       require("./upload"));
app.use("/api/admin",        require("./admin"));
app.use('/api/admin',        require('./admin_regenerate'));
app.use('/api/admin',        require('./admin_dashboard'));
app.use('/api/admin',        require('./tax_tracker'));
app.use('/api/payments',     paymentsRouter);
app.use('/api/ranks',        ranksRouter);

// Cron jobs
cron.schedule('0 0 * * *', () => updateRanks(), { timezone: "Europe/London" });
cron.schedule('0 16 * * *', () => sendDailyRevisionEmails(), { timezone: "Europe/London" });
cron.schedule("0 18 * * *", async () => {
  try { await require("./notifications").sendDailyStreakReminders(); } catch(e) { console.error("Streak reminder failed:", e.message); }
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`✦ EduPositive API running on port ${PORT}`));
module.exports = app;
