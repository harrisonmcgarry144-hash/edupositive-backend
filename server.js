require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cron = require('node-cron');
const { sendDailyRevisionEmails } = require('./daily_email');

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true },
});
app.set("io", io);
require("./realtime")(io);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.use("/api/auth",         require("./auth"));
app.use("/api/users",        require("./users"));
app.use("/api/content",      require("./content"));
app.use("/api/flashcards",   require("./flashcards"));
app.use("/api/ai",           require("./ai"));
app.use("/api/exams",        require("./exams"));
app.use("/api/analytics",    require("./analytics"));
app.use("/api/gamification", require("./gamification"));
app.use("/api/social",       require("./social"));
app.use('/api/classes', require('./classes'));
app.use("/api/tutors",       require("./tutors"));
app.use("/api/upload",       require("./upload"));
app.use("/api/admin",        require("./admin"));

app.get("/api/health", (_, res) => res.json({ status: "ok", app: "EduPositive", version: "1.0.0" }));

cron.schedule("0 18 * * *", async () => {
  try {
    await require("./notifications").sendDailyStreakReminders();
  } catch (e) {
    console.error("Cron streak reminder failed:", e.message);
  }
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});
// Daily revision email at 4pm GMT
cron.schedule('0 16 * * *', () => {
  sendDailyRevisionEmails();
}, { timezone: "Europe/London" });
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`✦ EduPositive API running on port ${PORT}`);
});

module.exports = app;