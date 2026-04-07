const router = require("express").Router();
const db     = require('./index');
const { authenticate } = require('./authmiddleware');

// GET /api/analytics/dashboard
router.get("/dashboard", authenticate, async (req, res, next) => {
  try {
    const [user, memStrength, examStats, xpHistory, upcomingExams] = await Promise.all([
      db.one(
        "SELECT xp, level, streak, longest_streak FROM users WHERE id=$1",
        [req.user.id]
      ),
      db.many(
        `SELECT ms.*, st.name AS subtopic, t.name AS topic, s.name AS subject
         FROM memory_strength ms
         JOIN subtopics st ON st.id=ms.subtopic_id
         JOIN topics t ON t.id=st.topic_id
         JOIN subjects s ON s.id=t.subject_id
         WHERE ms.user_id=$1 ORDER BY ms.score`,
        [req.user.id]
      ),
      db.one(
        `SELECT COUNT(*)::int AS total,
                ROUND(AVG(total_score),1) AS avg_score,
                MAX(total_score) AS best_score
         FROM exam_attempts WHERE user_id=$1 AND submitted_at IS NOT NULL`,
        [req.user.id]
      ),
      db.many(
        `SELECT DATE(created_at) AS date, SUM(amount)::int AS xp_earned
         FROM xp_events WHERE user_id=$1
         GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 14`,
        [req.user.id]
      ),
      db.many(
        `SELECT ue.*, s.name AS subject_name,
                (ue.exam_date - CURRENT_DATE)::int AS days_until
         FROM user_exams ue LEFT JOIN subjects s ON s.id=ue.subject_id
         WHERE ue.user_id=$1 AND ue.exam_date >= CURRENT_DATE
         ORDER BY ue.exam_date LIMIT 5`,
        [req.user.id]
      ),
    ]);

    const weak   = memStrength.filter(m => m.score < 50);
    const strong = memStrength.filter(m => m.score >= 70);
    const overall = memStrength.length
      ? Math.round(memStrength.reduce((a,b) => a + parseFloat(b.score), 0) / memStrength.length)
      : 0;

    res.json({ user, memory: { overall, bySubtopic: memStrength, weak, strong },
               exams: examStats, xpHistory, upcomingExams });
  } catch (err) { next(err); }
});

// GET /api/analytics/memory
router.get("/memory", authenticate, async (req, res, next) => {
  try {
    const { subjectId } = req.query;
    let q = `
      SELECT ms.*, st.name AS subtopic, t.name AS topic, s.name AS subject, s.id AS subject_id
      FROM memory_strength ms
      JOIN subtopics st ON st.id=ms.subtopic_id
      JOIN topics t ON t.id=st.topic_id
      JOIN subjects s ON s.id=t.subject_id
      WHERE ms.user_id=$1`;
    const p = [req.user.id];
    if (subjectId) q += ` AND s.id=$${p.push(subjectId)}`;
    q += " ORDER BY ms.score";
    res.json(await db.many(q, p));
  } catch (err) { next(err); }
});

// GET /api/analytics/xp-history
router.get("/xp-history", authenticate, async (req, res, next) => {
  try {
    const history = await db.many(
      `SELECT DATE(created_at) AS date, SUM(amount)::int AS xp_earned, COUNT(*)::int AS events
       FROM xp_events WHERE user_id=$1
       GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(history);
  } catch (err) { next(err); }
});

// POST /api/analytics/target-grade
router.post("/target-grade", authenticate, async (req, res, next) => {
  try {
    const { targetGrade, subjectId } = req.body;
    if (!targetGrade) return res.status(400).json({ error: "targetGrade required" });

    const gradeMap = { "A*":90, A:80, B:70, C:60, D:50, 9:90, 8:80, 7:70, 6:60, 5:50, 4:40 };
    const required = gradeMap[targetGrade] ?? 70;

    let q = `
      SELECT ms.score, st.name, t.name AS topic
      FROM memory_strength ms
      JOIN subtopics st ON st.id=ms.subtopic_id
      JOIN topics t ON t.id=st.topic_id`;
    const p = [req.user.id];
    if (subjectId) {
      q += ` JOIN subjects s ON s.id=t.subject_id WHERE ms.user_id=$1 AND s.id=$${p.push(subjectId)}`;
    } else {
      q += ` WHERE ms.user_id=$1`;
    }

    const scores = await db.many(q, p);
    const avg = scores.length
      ? scores.reduce((a,b) => a + parseFloat(b.score), 0) / scores.length : 0;

    res.json({
      targetGrade,
      required,
      currentEstimate: Math.round(avg),
      gap: Math.max(0, Math.round(required - avg)),
      onTrack: avg >= required,
      priorityTopics: scores.filter(s=>s.score<required).sort((a,b)=>a.score-b.score).slice(0,5),
      roadmap: avg >= required
        ? `You're on track for ${targetGrade}! Keep revising consistently.`
        : `Improve ${scores.filter(s=>s.score<required).length} areas by an average of ${Math.round(required-avg)}% to reach ${targetGrade}.`,
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/common-mistakes
router.get("/common-mistakes", authenticate, async (req, res, next) => {
  try {
    const answers = await db.many(
      `SELECT ea.ai_feedback, eq.topic_id, t.name AS topic
       FROM exam_answers ea
       JOIN exam_questions eq ON eq.id=ea.question_id
       JOIN exam_attempts att ON att.id=ea.attempt_id
       LEFT JOIN topics t ON t.id=eq.topic_id
       WHERE att.user_id=$1 AND ea.ai_feedback IS NOT NULL
       ORDER BY ea.ai_marked_at DESC LIMIT 30`,
      [req.user.id]
    );
    // Aggregate common improvement themes
    const improvements = answers.flatMap(a => {
      try { return JSON.parse(a.ai_feedback)?.improvements || []; } catch { return []; }
    });
    res.json({ recentFeedback: answers.slice(0,10), improvements });
  } catch (err) { next(err); }
});

// GET /api/analytics/peers  — anonymised platform-wide insights
router.get("/peers", authenticate, async (req, res, next) => {
  try {
    const [topTopics, avgStreak, activeToday] = await Promise.all([
      db.many(
        `SELECT t.name, COUNT(*)::int AS revision_count
         FROM study_schedule ss
         JOIN subtopics st ON st.id=ss.subtopic_id
         JOIN topics t ON t.id=st.topic_id
         GROUP BY t.name ORDER BY revision_count DESC LIMIT 5`,
        []
      ),
      db.one("SELECT ROUND(AVG(streak),1) AS avg FROM users WHERE last_active=CURRENT_DATE"),
      db.one("SELECT COUNT(*)::int AS count FROM users WHERE last_active=CURRENT_DATE"),
    ]);
    res.json({ topTopics, avgStreak: avgStreak.avg, activeToday: activeToday.count });
  } catch (err) { next(err); }
});

module.exports = router;
