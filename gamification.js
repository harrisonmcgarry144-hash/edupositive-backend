const router = require("express").Router();
const db     = require('./index');
const { authenticate } = require('./authmiddleware');
const { awardXP, seedAchievements } = require('./gamification');

// GET /api/gamification/leaderboard
router.get("/leaderboard", authenticate, async (req, res, next) => {
  try {
    const { scope = "global" } = req.query;
    let q, p;
const users = await db.many(
      `SELECT u.id, u.username, u.xp, u.level, u.streak, u.avatar_url,
              (u.id = $1) AS "isMe"
       FROM users u
       WHERE u.id = $1
       OR u.id IN (
         SELECT CASE WHEN requester=$1 THEN receiver ELSE requester END
FROM friendships WHERE (requester=$1 OR receiver=$1) AND status='accepted'
       )
       ORDER BY u.xp DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(users);
    res.json(users.map((u, i) => ({ ...u, rank: i+1, isMe: u.id === req.user.id })));
  } catch (err) { next(err); }
});

// GET /api/gamification/achievements
router.get("/achievements", authenticate, async (req, res, next) => {
  try {
    await seedAchievements();
    const all = await db.many(
      `SELECT a.*, ua.earned_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=$1
       ORDER BY ua.earned_at DESC NULLS LAST, a.xp_reward DESC`,
      [req.user.id]
    );
    res.json(all);
  } catch (err) { next(err); }
});

// POST /api/gamification/pomodoro/start
router.post("/pomodoro/start", authenticate, async (req, res, next) => {
  try {
    const { durationMins, contextType, contextId } = req.body;
    const session = await db.one(
      `INSERT INTO pomodoro_sessions (user_id, duration_mins, context_type, context_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, durationMins || 25, contextType || null, contextId || null]
    );
    res.status(201).json(session);
  } catch (err) { next(err); }
});

// POST /api/gamification/pomodoro/:id/complete
router.post("/pomodoro/:id/complete", authenticate, async (req, res, next) => {
  try {
    await db.query(
      "UPDATE pomodoro_sessions SET completed=true, ended_at=NOW() WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    const result = await awardXP(req.user.id, 25, "pomodoro_complete", req.params.id);
    res.json({ message: "Pomodoro complete! Take a break.", xpAwarded: 25, ...result });
  } catch (err) { next(err); }
});

// GET /api/gamification/stats
router.get("/stats", authenticate, async (req, res, next) => {
  try {
    const [xpToday, pomosThisWeek, totalPomos] = await Promise.all([
      db.one(
        "SELECT COALESCE(SUM(amount),0)::int AS xp FROM xp_events WHERE user_id=$1 AND DATE(created_at)=CURRENT_DATE",
        [req.user.id]
      ),
      db.one(
        "SELECT COUNT(*)::int AS count FROM pomodoro_sessions WHERE user_id=$1 AND completed=true AND started_at > NOW()-INTERVAL '7 days'",
        [req.user.id]
      ),
      db.one(
        "SELECT COUNT(*)::int AS count FROM pomodoro_sessions WHERE user_id=$1 AND completed=true",
        [req.user.id]
      ),
    ]);
    res.json({ xpToday: xpToday.xp, pomosThisWeek: pomosThisWeek.count, totalPomos: totalPomos.count });
  } catch (err) { next(err); }
});

module.exports = router;
