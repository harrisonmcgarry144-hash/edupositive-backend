const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const db = require("./index");
const email = require("./email");
const { awardXP } = require("./gamification");
const { authenticate } = require("./authmiddleware");

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 });
const sign = (id) => jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: "7d" });

router.post("/register", limiter, async (req, res, next) => {
  try {
    const { email: rawEmail, password, username, fullName } = req.body;
    if (!rawEmail || !password || !username)
      return res.status(400).json({ error: "Email, password and username are required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    const exists = await db.one("SELECT id FROM users WHERE email=$1 OR username=$2", [rawEmail.toLowerCase(), username]);
    if (exists) return res.status(409).json({ error: "Email or username already taken" });
    const hash = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const user = await db.one(
      "INSERT INTO users (email, password_hash, username, full_name, verify_token, verify_expires) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, username, role",
      [rawEmail.toLowerCase(), hash, username, fullName || username, token, expires]
    );
    try { await email.sendVerificationEmail(rawEmail, token); } catch (e) { console.error("Email failed:", e.message); }
    res.status(201).json({ message: "Account created. Check your email to verify.", token: sign(user.id), user });
  } catch (err) { next(err); }
});

router.post("/login", limiter, async (req, res, next) => {
  try {
    const { email: rawEmail, username: rawUsername, password } = req.body;
const identifier = (rawUsername || rawEmail || "").toLowerCase();
 if (!identifier || !password) return res.status(400).json({ error: "Username and password required" });
   const user = await db.one("SELECT * FROM users WHERE username=$1 OR email=$1", [identifier]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    await updateStreak(user.id);
    const fresh = await db.one("SELECT * FROM users WHERE id=$1", [user.id]);
    res.json({
      token: sign(user.id),
      user: {
        id: fresh.id, email: fresh.email, username: fresh.username,
        fullName: fresh.full_name, avatarUrl: fresh.avatar_url,
        role: fresh.role, isVerified: fresh.is_verified,
        levelType: fresh.level_type, careerGoal: fresh.career_goal,
        xp: fresh.xp, level: fresh.level, streak: fresh.streak,
      },
    });
  } catch (err) { next(err); }
});

router.get("/verify/:token", async (req, res, next) => {
  try {
    const user = await db.one(
      "UPDATE users SET is_verified=true, verify_token=NULL, verify_expires=NULL WHERE verify_token=$1 AND verify_expires > NOW() RETURNING id",
      [req.params.token]
    );
    if (!user) return res.status(400).json({ error: "Invalid or expired link" });
    await awardXP(user.id, 100, "account_verified");
    res.json({ message: "Email verified! You can now log in." });
  } catch (err) { next(err); }
});

router.post("/forgot-password", limiter, async (req, res, next) => {
  try {
    const user = await db.one("SELECT id FROM users WHERE email=$1", [req.body.email?.toLowerCase()]);
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await db.query("UPDATE users SET reset_token=$1, reset_expires=$2 WHERE id=$3", [token, expires, user.id]);
      try { await email.sendPasswordResetEmail(req.body.email, token); } catch (e) { console.error("Email failed:", e.message); }
    }
    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) { next(err); }
});

router.post("/reset-password", limiter, async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password required" });
    const user = await db.one("SELECT id FROM users WHERE reset_token=$1 AND reset_expires > NOW()", [token]);
    if (!user) return res.status(400).json({ error: "Invalid or expired reset link" });
    await db.query("UPDATE users SET password_hash=$1, reset_token=NULL, reset_expires=NULL WHERE id=$2",
      [await bcrypt.hash(password, 12), user.id]);
    res.json({ message: "Password reset successfully." });
  } catch (err) { next(err); }
});

router.post("/onboarding", authenticate, async (req, res, next) => {
  try {
    const { levelType, subjectIds, careerGoal } = req.body;
    await db.query("UPDATE users SET level_type=$1, career_goal=$2 WHERE id=$3",
      [levelType || null, careerGoal || null, req.user.id]);
    if (subjectIds?.length) {
      await db.query("DELETE FROM user_subjects WHERE user_id=$1", [req.user.id]);
      for (const sid of subjectIds) {
        await db.query("INSERT INTO user_subjects (user_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.user.id, sid]);
      }
    }
    res.json({ message: "Onboarding complete" });
  } catch (err) { next(err); }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await db.one(
      "SELECT id, email, username, full_name, avatar_url, bio, role, level_type, career_goal, school, is_public, is_verified, xp, level, streak, longest_streak, created_at FROM users WHERE id=$1",
      [req.user.id]
    );
    const subjects = await db.many(
      "SELECT s.* FROM subjects s JOIN user_subjects us ON us.subject_id=s.id WHERE us.user_id=$1",
      [req.user.id]
    );
    res.json({ ...user, subjects });
  } catch (err) { next(err); }
});

async function updateStreak(userId) {
  const user = await db.one("SELECT last_active, streak, grace_used FROM users WHERE id=$1", [userId]);
  const today = new Date().toISOString().slice(0, 10);
  const lastActive = user.last_active?.toISOString().slice(0, 10);
  if (lastActive === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayBefore = new Date(Date.now() - 172800000).toISOString().slice(0, 10);
  let streak = user.streak, graceUsed = user.grace_used;
  if (lastActive === yesterday) { streak += 1; graceUsed = false; }
  else if (lastActive === dayBefore && !graceUsed) { streak += 1; graceUsed = true; }
  else { streak = 1; graceUsed = false; }
  await db.query(
    "UPDATE users SET streak=$1, last_active=$2, grace_used=$3, longest_streak=GREATEST(longest_streak,$1) WHERE id=$4",
    [streak, today, graceUsed, userId]
  );
}

module.exports = router;