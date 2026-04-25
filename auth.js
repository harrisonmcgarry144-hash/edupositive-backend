const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const db = require("./index");
const email = require("./email");
const { authenticate } = require("./authmiddleware");

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 });
const sign = (id, tv = 0) => jwt.sign({ sub: id, tv }, process.env.JWT_SECRET, { expiresIn: "7d" });

function generateCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

router.post("/register", limiter, async (req, res, next) => {
  try {
    const { email: rawEmail, password, username, fullName } = req.body;
    if (!rawEmail || !password || !username) return res.status(400).json({ error: "Email, password and username are required" });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (!/[0-9]/.test(password) && !/[^a-zA-Z0-9]/.test(password)) return res.status(400).json({ error: "Password must contain at least one number or special character" });
    const exists = await db.one("SELECT id FROM users WHERE email=$1 OR username=$2", [rawEmail.toLowerCase(), username]);
    if (exists) return res.status(409).json({ error: "An account with those details already exists" });
    const hash = await bcrypt.hash(password, 12);
    const code = generateCode();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000);
    const user = await db.one(
      `INSERT INTO users (email, password_hash, username, full_name, verify_token, verify_expires, is_verified) VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id, email, username, role`,
      [rawEmail.toLowerCase(), hash, username, fullName || username, code, codeExpires]
    );
    try { await email.sendVerificationCode(rawEmail, username, code); } catch (e) { console.error("Email failed:", e.message); }
    res.status(201).json({ message: "Account created. Check your email for a 4-digit code.", token: sign(user.id), user: { ...user, isVerified: false }, requiresVerification: true });
  } catch (err) { next(err); }
});

router.post("/verify-code", authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required" });
    const user = await db.one("SELECT id, verify_token, verify_expires, is_verified, verify_attempts FROM users WHERE id=$1", [req.user.id]);
    if (user.is_verified) return res.json({ message: "Already verified" });
    const attempts = user.verify_attempts || 0;
    if (attempts >= 5) return res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
    if (!user.verify_token || user.verify_token !== String(code).trim()) {
      await db.query("UPDATE users SET verify_attempts=COALESCE(verify_attempts,0)+1 WHERE id=$1", [req.user.id]);
      const remaining = 4 - attempts;
      return res.status(400).json({ error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
    }
    if (new Date() > new Date(user.verify_expires)) return res.status(400).json({ error: "Code has expired. Request a new one." });
    await db.query("UPDATE users SET is_verified=true, verify_token=NULL, verify_expires=NULL, verify_attempts=0 WHERE id=$1", [req.user.id]);
    res.json({ message: "Email verified!", verified: true });
  } catch (err) { next(err); }
});

router.post("/resend-code", authenticate, async (req, res, next) => {
  try {
    const user = await db.one("SELECT id, email, username, is_verified FROM users WHERE id=$1", [req.user.id]);
    if (user.is_verified) return res.json({ message: "Already verified" });
    const code = generateCode();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000);
    await db.query("UPDATE users SET verify_token=$1, verify_expires=$2, verify_attempts=0 WHERE id=$3", [code, codeExpires, req.user.id]);
    try { await email.sendVerificationCode(user.email, user.username, code); } catch (e) { console.error("Email failed:", e.message); }
    res.json({ message: "New code sent to your email." });
  } catch (err) { next(err); }
});

router.post("/login", limiter, async (req, res, next) => {
  try {
    const { email: rawEmail, username: rawUsername, password } = req.body;
    const identifier = (rawUsername || rawEmail || "").toLowerCase().trim();
    if (!identifier || !password) return res.status(400).json({ error: "Email or username and password required" });
    const user = await db.one("SELECT * FROM users WHERE username=$1 OR email=$1", [identifier]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const lockoutUntil = user.lockout_until ? new Date(user.lockout_until) : null;
    if (lockoutUntil && lockoutUntil > new Date()) {
      const mins = Math.ceil((lockoutUntil - new Date()) / 60000);
      return res.status(429).json({ error: `Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const lockout = attempts >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await db.query("UPDATE users SET failed_login_attempts=$1, lockout_until=$2 WHERE id=$3", [attempts, lockout, user.id]);
      if (lockout) return res.status(429).json({ error: "Too many failed attempts. Account locked for 15 minutes." });
      return res.status(401).json({ error: "Invalid credentials" });
    }
    await db.query("UPDATE users SET failed_login_attempts=0, lockout_until=NULL WHERE id=$1", [user.id]);
    if (!user.is_verified) {
      const code = generateCode();
      const codeExpires = new Date(Date.now() + 15 * 60 * 1000);
      await db.query("UPDATE users SET verify_token=$1, verify_expires=$2 WHERE id=$3", [code, codeExpires, user.id]);
      try { await email.sendVerificationCode(user.email, user.username, code); } catch(e) {}
      return res.status(403).json({ error: "Please verify your email first.", requiresVerification: true, token: sign(user.id, user.token_version || 0) });
    }
    await updateStreak(user.id);
    const fresh = await db.one("SELECT * FROM users WHERE id=$1", [user.id]);
    const hasSubjects = await db.one("SELECT COUNT(*)::int AS count FROM user_subjects WHERE user_id=$1", [user.id]);
    const needsOnboarding = !fresh.level_type && hasSubjects.count === 0 && fresh.role !== 'admin';
    res.json({
      token: sign(user.id, fresh.token_version || 0),
      needsOnboarding,
      user: { id: fresh.id, email: fresh.email, username: fresh.username, fullName: fresh.full_name, avatarUrl: fresh.avatar_url, role: fresh.role, isVerified: fresh.is_verified, levelType: fresh.level_type, careerGoal: fresh.career_goal, xp: fresh.xp, level: fresh.level, streak: fresh.streak },
    });
  } catch (err) { next(err); }
});

router.post("/logout-all", authenticate, async (req, res, next) => {
  try {
    await db.query("UPDATE users SET token_version=COALESCE(token_version,0)+1 WHERE id=$1", [req.user.id]);
    res.json({ message: "All sessions logged out." });
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
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
    const user = await db.oneOrNone("SELECT id FROM users WHERE reset_token=$1 AND reset_expires > NOW()", [token]);
    if (!user) return res.status(400).json({ error: "Invalid or expired reset link" });
    await db.query("UPDATE users SET password_hash=$1, reset_token=NULL, reset_expires=NULL, token_version=COALESCE(token_version,0)+1 WHERE id=$2", [await bcrypt.hash(password, 12), user.id]);
    res.json({ message: "Password reset successfully. Please log in again." });
  } catch (err) { next(err); }
});

router.post("/onboarding", authenticate, async (req, res, next) => {
  try {
    const { levelType, subjectIds, boardSelections, customisations, careerGoal } = req.body;
    await db.query("UPDATE users SET level_type=$1, career_goal=$2, subject_customisations=$3 WHERE id=$4", [levelType || 'a-level', careerGoal || null, customisations ? JSON.stringify(customisations) : null, req.user.id]);
    if (subjectIds?.length) {
      await db.query("DELETE FROM user_subjects WHERE user_id=$1", [req.user.id]);
      const boards = subjectIds.map(sid => boardSelections?.[sid] || 'AQA');
      await db.query(
        `INSERT INTO user_subjects (user_id, subject_id, exam_board)
         SELECT $1, unnest($2::int[]), unnest($3::text[]) ON CONFLICT DO NOTHING`,
        [req.user.id, subjectIds, boards]
      );
    }
    res.json({ message: "Onboarding complete" });
  } catch (err) { next(err); }
});

router.delete("/account", authenticate, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required to delete account" });
    const user = await db.one("SELECT * FROM users WHERE id=$1", [req.user.id]);
    if (user.role === 'admin') return res.status(403).json({ error: "Admin accounts cannot be deleted this way" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Incorrect password" });
    if (user.stripe_subscription_id) {
      try { const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); await stripe.subscriptions.cancel(user.stripe_subscription_id); } catch(e) {}
    }
    await db.query("DELETE FROM users WHERE id=$1", [req.user.id]);
    res.json({ message: "Account deleted. Sorry to see you go." });
  } catch (err) { next(err); }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await db.one("SELECT id, email, username, full_name, avatar_url, bio, role, level_type, career_goal, school, is_public, is_verified, xp, level, streak, longest_streak, created_at FROM users WHERE id=$1", [req.user.id]);
    const subjects = await db.many("SELECT s.*, us.exam_board FROM subjects s JOIN user_subjects us ON us.subject_id=s.id WHERE us.user_id=$1", [req.user.id]);
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
  await db.query("UPDATE users SET streak=$1, last_active=$2, grace_used=$3, longest_streak=GREATEST(longest_streak,$1) WHERE id=$4", [streak, today, graceUsed, userId]);
}

module.exports = router;
