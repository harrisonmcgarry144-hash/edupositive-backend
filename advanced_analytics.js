// Advanced Analytics - premium user insights
const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const { hasPremium } = require('./payments');

async function requirePremium(req, res, next) {
  const isPrem = await hasPremium(req.user.id);
  if (!isPrem) return res.status(403).json({ error: "Premium required" });
  next();
}

// GET /api/analytics/advanced — comprehensive analytics
router.get("/advanced", authenticate, requirePremium, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Study time over last 30 days
    const dailyStudy = await db.many(
      `SELECT DATE(started_at) AS date, SUM(duration_mins)::int AS minutes
       FROM study_sessions
       WHERE user_id=$1 AND started_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(started_at) ORDER BY DATE(started_at)`,
      [userId]
    ).catch(() => []);

    // XP growth
    const xpGrowth = await db.many(
      `SELECT DATE(created_at) AS date, SUM(amount)::int AS xp
       FROM xp_events
       WHERE user_id=$1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY DATE(created_at)`,
      [userId]
    ).catch(() => []);

    // Subject performance
    const subjectPerf = await db.many(
      `SELECT s.name AS subject, AVG(ms.score)::int AS avg_score,
              COUNT(DISTINCT ms.subtopic_id)::int AS topics_studied
       FROM memory_strength ms
       JOIN subtopics st ON st.id = ms.subtopic_id
       JOIN topics t ON t.id = st.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE ms.user_id=$1
       GROUP BY s.name ORDER BY avg_score DESC`,
      [userId]
    ).catch(() => []);

    // Weak areas (bottom 10)
    const weakAreas = await db.many(
      `SELECT st.name AS subtopic, t.name AS topic, s.name AS subject, ms.score
       FROM memory_strength ms
       JOIN subtopics st ON st.id = ms.subtopic_id
       JOIN topics t ON t.id = st.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE ms.user_id=$1 AND ms.score IS NOT NULL
       ORDER BY ms.score ASC LIMIT 10`,
      [userId]
    ).catch(() => []);

    // Strong areas (top 5)
    const strongAreas = await db.many(
      `SELECT st.name AS subtopic, t.name AS topic, s.name AS subject, ms.score
       FROM memory_strength ms
       JOIN subtopics st ON st.id = ms.subtopic_id
       JOIN topics t ON t.id = st.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE ms.user_id=$1 AND ms.score IS NOT NULL
       ORDER BY ms.score DESC LIMIT 5`,
      [userId]
    ).catch(() => []);

    // Recent exam attempts
    const examAttempts = await db.many(
      `SELECT pp.title, ea.total_score, ea.submitted_at
       FROM exam_attempts ea
       JOIN past_papers pp ON pp.id = ea.paper_id
       WHERE ea.user_id=$1 AND ea.submitted_at IS NOT NULL
       ORDER BY ea.submitted_at DESC LIMIT 10`,
      [userId]
    ).catch(() => []);

    // Study streaks
    const streakInfo = await db.one(
      `SELECT streak, longest_streak, last_study_date FROM users WHERE id=$1`,
      [userId]
    ).catch(() => ({ streak: 0 }));

    // Totals
    const totals = await db.one(
      `SELECT
        (SELECT COUNT(*)::int FROM lesson_completions WHERE user_id=$1) AS lessons_done,
        (SELECT COUNT(*)::int FROM flashcard_progress WHERE user_id=$1) AS flashcards_reviewed,
        (SELECT COUNT(*)::int FROM chat_sessions WHERE user_id=$1) AS ai_chats,
        (SELECT COALESCE(SUM(duration_mins),0)::int FROM study_sessions WHERE user_id=$1) AS total_minutes,
        (SELECT COUNT(*)::int FROM pomodoro_sessions WHERE user_id=$1 AND completed=true) AS pomodoros`,
      [userId]
    ).catch(() => ({}));

    // Best study hour (when user gets most XP)
    const bestHour = await db.one(
      `SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(amount)::int AS xp
       FROM xp_events WHERE user_id=$1
       GROUP BY hour ORDER BY xp DESC LIMIT 1`,
      [userId]
    ).catch(() => null);

    res.json({
      dailyStudy, xpGrowth, subjectPerf, weakAreas, strongAreas,
      examAttempts, streakInfo, totals, bestHour,
    });
  } catch (err) { next(err); }
});

module.exports = router;
