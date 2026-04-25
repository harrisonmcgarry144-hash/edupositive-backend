const router = require("express").Router();
const db     = require('./index');
const { authenticate } = require('./authmiddleware');

const PUBLIC_FIELDS = `id, username, full_name, avatar_url, bio, school, xp, level, streak, is_public, created_at`;

// GET /api/users/revising-now — must be before /:id
router.get("/revising-now", async (req, res, next) => {
  try {
    const row = await db.one("SELECT COUNT(*)::int AS count FROM users");
    const count = Math.round(row.count * 10.3531);
    res.json({ count });
  } catch (err) { next(err); }
});

// GET /api/users/me/subjects
router.get("/me/subjects", authenticate, async (req, res, next) => {
  try {
    const subjects = await db.many(
      `SELECT s.* FROM subjects s
       INNER JOIN user_subjects us ON us.subject_id = s.id
       WHERE us.user_id = $1
       ORDER BY s.name`,
      [req.user.id]
    );
    res.json(subjects);
  } catch (e) { next(e); }
});

// PUT /api/users/me/subjects
router.put("/me/subjects", authenticate, async (req, res, next) => {
  try {
    const { subjectIds } = req.body;
    await db.query("DELETE FROM user_subjects WHERE user_id=$1", [req.user.id]);
    for (const sid of (subjectIds || [])) {
      await db.query(
        "INSERT INTO user_subjects (user_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [req.user.id, sid]
      );
    }
    res.json({ message: "Subjects updated" });
  } catch (err) { next(err); }
});

// GET /api/users/me/schedule
router.get("/me/schedule", authenticate, async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    const schedule = await db.many(
      `SELECT ss.*, st.name AS subtopic_name, t.name AS topic_name, s.name AS subject_name
       FROM study_schedule ss
       JOIN subtopics st ON st.id = ss.subtopic_id
       JOIN topics t ON t.id = st.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE ss.user_id=$1 AND ss.scheduled_date=$2
       ORDER BY ss.priority DESC`,
      [req.user.id, today]
    );
    res.json(schedule);
  } catch (err) { next(err); }
});

// POST /api/users/me/schedule/:id/complete
router.post("/me/schedule/:id/complete", authenticate, async (req, res, next) => {
  try {
    await db.query(
      "UPDATE study_schedule SET completed=true WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    const { awardXP } = require('./gamification');
    await awardXP(req.user.id, 30, "schedule_item_complete", req.params.id);
    res.json({ message: "Marked complete" });
  } catch (err) { next(err); }
});

// GET /api/users/me/notifications
router.get("/me/notifications", authenticate, async (req, res, next) => {
  try {
    const notifs = await db.many(
      "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
      [req.user.id]
    );
    res.json(notifs);
  } catch (err) { next(err); }
});

// PUT /api/users/me/notifications/:id/read
router.put("/me/notifications/:id/read", authenticate, async (req, res, next) => {
  try {
    await db.query("UPDATE notifications SET read=true WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]);
    res.json({ message: "Marked read" });
  } catch (err) { next(err); }
});

// PUT /api/users/me — update own profile
router.put("/me", authenticate, async (req, res, next) => {
  try {
    const { fullName, bio, school, isPublic, levelType, careerGoal, pomodoroMins, pomodoroOn } = req.body;
    const user = await db.one(
      `UPDATE users SET
        full_name     = COALESCE($1, full_name),
        bio           = COALESCE($2, bio),
        school        = COALESCE($3, school),
        is_public     = COALESCE($4, is_public),
        level_type    = COALESCE($5, level_type),
        career_goal   = COALESCE($6, career_goal),
        pomodoro_mins = COALESCE($7, pomodoro_mins),
        pomodoro_on   = COALESCE($8, pomodoro_on),
        updated_at    = NOW()
       WHERE id=$9
       RETURNING id, email, username, full_name, bio, avatar_url, school, is_public,
                 level_type, career_goal, pomodoro_mins, pomodoro_on`,
      [fullName, bio, school, isPublic, levelType, careerGoal, pomodoroMins, pomodoroOn, req.user.id]
    );
    res.json(user);
  } catch (err) { next(err); }
});

// GET /api/users/:id — must be last
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const user = await db.one(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id=$1`, [req.params.id]);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.is_public && user.id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "This profile is private" });
    res.json(user);
  } catch (err) { next(err); }
});

module.exports = router;
