// /api/admin/dashboard-stats — comprehensive stats for admin
const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  next();
}

// GET /api/admin/stats
router.get("/stats", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const [users, premium, subjects, topics, subtopics, lessons, questions, pastPapers, aiGen, sessions] = await Promise.all([
      db.one("SELECT COUNT(*)::int AS count FROM users"),
      db.one("SELECT COUNT(*)::int AS count FROM users WHERE is_premium=true"),
      db.one("SELECT COUNT(*)::int AS count FROM subjects"),
      db.one("SELECT COUNT(*)::int AS count FROM topics"),
      db.one("SELECT COUNT(*)::int AS count FROM subtopics"),
      db.one("SELECT COUNT(*)::int AS count FROM lessons"),
      db.one("SELECT COUNT(*)::int AS count FROM exam_questions").catch(() => ({count:0})),
      db.one("SELECT COUNT(*)::int AS count FROM past_papers").catch(() => ({count:0})),
      db.one("SELECT COUNT(*)::int AS count FROM lessons WHERE is_ai_generated=true"),
      db.one("SELECT COUNT(*)::int AS count FROM chat_sessions").catch(() => ({count:0})),
    ]);

    // Subtopic coverage - how many have at least one lesson
    const coverage = await db.one(`
      SELECT 
        COUNT(DISTINCT st.id)::int AS total_subtopics,
        COUNT(DISTINCT st.id) FILTER (WHERE EXISTS (SELECT 1 FROM lessons l WHERE l.subtopic_id = st.id))::int AS covered
      FROM subtopics st
    `);

    // Recent signups
    const recentSignups = await db.many(
      "SELECT id, username, email, created_at, role FROM users ORDER BY created_at DESC LIMIT 10"
    );

    res.json({
      users: users.count,
      premiumUsers: premium.count,
      subjects: subjects.count,
      topics: topics.count,
      subtopics: subtopics.count,
      lessons: lessons.count,
      aiGeneratedLessons: aiGen.count,
      questions: questions.count,
      pastPapers: pastPapers.count,
      chatSessions: sessions.count,
      coverage: {
        total: coverage.total_subtopics,
        covered: coverage.covered,
        percentage: coverage.total_subtopics ? Math.round((coverage.covered / coverage.total_subtopics) * 100) : 0,
      },
      recentSignups,
    });
  } catch (err) { next(err); }
});

// GET /api/admin/users — list all users
router.get("/users", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const users = await db.many(
      `SELECT id, username, email, full_name, role, is_premium, premium_until, is_verified,
              xp, level, streak, created_at, rank
       FROM users ORDER BY created_at DESC LIMIT 200`
    );
    res.json(users);
  } catch (err) { next(err); }
});

// POST /api/admin/users/:id/grant-premium
router.post("/users/:id/grant-premium", authenticate, requireAdmin, async (req, res, next) => {
  try {
    await db.query(
      "UPDATE users SET is_premium=true, premium_until='2030-01-01' WHERE id=$1",
      [req.params.id]
    );
    res.json({ message: "Premium granted" });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:id/revoke-premium
router.post("/users/:id/revoke-premium", authenticate, requireAdmin, async (req, res, next) => {
  try {
    await db.query(
      "UPDATE users SET is_premium=false, premium_until=NULL WHERE id=$1",
      [req.params.id]
    );
    res.json({ message: "Premium revoked" });
  } catch (err) { next(err); }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
    await db.query("DELETE FROM users WHERE id=$1 AND role != 'admin'", [req.params.id]);
    res.json({ message: "User deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
