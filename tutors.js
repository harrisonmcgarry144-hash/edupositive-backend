const router = require("express").Router();
const db     = require('./index');
const { authenticate, requireAdmin } = require('./authmiddleware');

// GET /api/tutors
router.get("/", authenticate, async (req, res, next) => {
  try {
    const { subjectId, maxRate } = req.query;
    let q = `
      SELECT tp.*, u.username, u.full_name, u.avatar_url
      FROM tutor_profiles tp
      JOIN users u ON u.id=tp.user_id
      WHERE tp.is_active=true`;
    const p = [];
    if (subjectId) q += ` AND $${p.push(subjectId)}=ANY(tp.subject_ids)`;
    if (maxRate)   q += ` AND tp.hourly_rate<=$${p.push(maxRate)}`;
    q += " ORDER BY tp.rating DESC, tp.rating_count DESC";
    res.json(await db.many(q, p));
  } catch (err) { next(err); }
});

// GET /api/tutors/:id
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const tutor = await db.one(
      `SELECT tp.*, u.username, u.full_name, u.avatar_url, u.bio
       FROM tutor_profiles tp JOIN users u ON u.id=tp.user_id
       WHERE tp.id=$1`,
      [req.params.id]
    );
    if (!tutor) return res.status(404).json({ error: "Tutor not found" });

    const availability = await db.many(
      "SELECT * FROM tutor_availability WHERE tutor_id=$1 ORDER BY day_of_week, start_time",
      [req.params.id]
    );
    const reviews = await db.many(
      `SELECT ts.student_rating, ts.student_review, u.username, ts.created_at
       FROM tutor_sessions ts JOIN users u ON u.id=ts.student_id
       WHERE ts.tutor_id=$1 AND ts.student_rating IS NOT NULL
       ORDER BY ts.created_at DESC LIMIT 10`,
      [req.params.id]
    );
    res.json({ ...tutor, availability, reviews });
  } catch (err) { next(err); }
});

// POST /api/tutors/profile — become a tutor
router.post("/profile", authenticate, async (req, res, next) => {
  try {
    const { bio, qualifications, subjectIds, hourlyRate } = req.body;
    const profile = await db.one(
      `INSERT INTO tutor_profiles (user_id, bio, qualifications, subject_ids, hourly_rate)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET bio=$2, qualifications=$3, subject_ids=$4, hourly_rate=$5
       RETURNING *`,
      [req.user.id, bio || null, qualifications || [], subjectIds || [], hourlyRate || null]
    );
    await db.query("UPDATE users SET role='tutor' WHERE id=$1", [req.user.id]);
    res.status(201).json(profile);
  } catch (err) { next(err); }
});

// POST /api/tutors/:id/availability
router.post("/:id/availability", authenticate, async (req, res, next) => {
  try {
    const profile = await db.one("SELECT user_id FROM tutor_profiles WHERE id=$1", [req.params.id]);
    if (!profile || profile.user_id !== req.user.id)
      return res.status(403).json({ error: "Not your profile" });

    const { slots } = req.body; // [{ dayOfWeek, startTime, endTime }]
    await db.query("DELETE FROM tutor_availability WHERE tutor_id=$1", [req.params.id]);
    for (const slot of (slots || [])) {
      await db.query(
        "INSERT INTO tutor_availability (tutor_id, day_of_week, start_time, end_time) VALUES ($1,$2,$3,$4)",
        [req.params.id, slot.dayOfWeek, slot.startTime, slot.endTime]
      );
    }
    res.json({ message: "Availability updated" });
  } catch (err) { next(err); }
});

// POST /api/tutors/:id/book
router.post("/:id/book", authenticate, async (req, res, next) => {
  try {
    const { scheduledAt, durationMins, notes } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: "scheduledAt required" });

    const tutor = await db.one("SELECT * FROM tutor_profiles WHERE id=$1 AND is_active=true", [req.params.id]);
    if (!tutor) return res.status(404).json({ error: "Tutor not found or inactive" });

    const session = await db.one(
      `INSERT INTO tutor_sessions (tutor_id, student_id, scheduled_at, duration_mins, price, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, req.user.id, scheduledAt, durationMins || 60,
       tutor.hourly_rate ? (tutor.hourly_rate * ((durationMins||60)/60)) : null, notes || null]
    );
    // Notify tutor
    req.app.get("io").to(`user:${tutor.user_id}`).emit("session_booked", { session, studentId: req.user.id });
    res.status(201).json(session);
  } catch (err) { next(err); }
});

// PUT /api/tutors/sessions/:id/confirm
router.put("/sessions/:id/confirm", authenticate, async (req, res, next) => {
  try {
    const session = await db.oneOrNone(
      `SELECT ts.*, tp.user_id AS tutor_user_id FROM tutor_sessions ts
       JOIN tutor_profiles tp ON tp.id=ts.tutor_id WHERE ts.id=$1`,
      [req.params.id]
    );
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.tutor_user_id !== req.user.id)
      return res.status(403).json({ error: "Not your session" });
    const updated = await db.oneOrNone(
      "UPDATE tutor_sessions SET status='confirmed', meeting_url=$1 WHERE id=$2 RETURNING *",
      [req.body.meetingUrl || null, req.params.id]
    );
    if (!updated) return res.status(404).json({ error: "Session not found" });
    req.app.get("io")?.to(`user:${session.student_id}`).emit("session_confirmed", { session: updated });
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /api/tutors/sessions/:id/review
router.post("/sessions/:id/review", authenticate, async (req, res, next) => {
  try {
    const { rating, review } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "rating 1-5 required" });
    const session = await db.one(
      "UPDATE tutor_sessions SET student_rating=$1, student_review=$2, status='completed' WHERE id=$3 AND student_id=$4 RETURNING tutor_id",
      [rating, review || null, req.params.id, req.user.id]
    );
    if (!session) return res.status(404).json({ error: "Session not found" });
    // Update tutor rating
    await db.query(
      `UPDATE tutor_profiles SET
         rating_count = rating_count + 1,
         rating = ((rating * rating_count) + $1) / (rating_count + 1)
       WHERE id=$2`,
      [rating, session.tutor_id]
    );
    res.json({ message: "Review submitted" });
  } catch (err) { next(err); }
});

// Admin: verify a tutor
router.put("/:id/verify", authenticate, requireAdmin, async (req, res, next) => {
  try {
    await db.query("UPDATE tutor_profiles SET is_verified=$1 WHERE id=$2", [req.body.verified ?? true, req.params.id]);
    res.json({ message: "Tutor verification updated" });
  } catch (err) { next(err); }
});

// GET /api/tutors/my/sessions — tutor sees their own sessions
router.get("/my/sessions", authenticate, async (req, res, next) => {
  try {
    const profile = await db.one("SELECT id FROM tutor_profiles WHERE user_id=$1", [req.user.id]);
    if (!profile) return res.status(404).json({ error: "No tutor profile" });
    const sessions = await db.many(
      `SELECT ts.*, u.username AS student_name, u.avatar_url AS student_avatar
       FROM tutor_sessions ts JOIN users u ON u.id=ts.student_id
       WHERE ts.tutor_id=$1 ORDER BY ts.scheduled_at DESC`,
      [profile.id]
    );
    res.json(sessions);
  } catch (err) { next(err); }
});

module.exports = router;
