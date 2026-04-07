const router = require("express").Router();
const db     = require('./index');
const { authenticate, requireAdmin } = require('./authmiddleware');

// All routes in this file require admin role
router.use(authenticate, requireAdmin);

// ── Overview ──────────────────────────────────────────────────────────────────

// GET /api/admin/overview
router.get("/overview", async (req, res, next) => {
  try {
    const [users, content, exams, activeToday] = await Promise.all([
      db.one("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_verified) ::int AS verified FROM users"),
      db.one(`SELECT
        (SELECT COUNT(*)::int FROM subjects) AS subjects,
        (SELECT COUNT(*)::int FROM topics) AS topics,
        (SELECT COUNT(*)::int FROM subtopics) AS subtopics,
        (SELECT COUNT(*)::int FROM lessons WHERE is_published) AS published_lessons,
        (SELECT COUNT(*)::int FROM lessons WHERE NOT is_published) AS draft_lessons`),
      db.one(`SELECT
        (SELECT COUNT(*)::int FROM past_papers) AS papers,
        (SELECT COUNT(*)::int FROM exam_questions) AS questions,
        (SELECT COUNT(*)::int FROM exam_attempts WHERE submitted_at IS NOT NULL) AS attempts`),
      db.one("SELECT COUNT(*)::int AS count FROM users WHERE last_active=CURRENT_DATE"),
    ]);
    res.json({ users, content, exams, activeToday: activeToday.count });
  } catch (err) { next(err); }
});

// ── User Management ───────────────────────────────────────────────────────────

router.get("/users", async (req, res, next) => {
  try {
    const { q, role } = req.query;
    let query = `SELECT id, email, username, full_name, role, is_verified, xp, level, streak, created_at
                 FROM users WHERE 1=1`;
    const p = [];
    if (q)    query += ` AND (username ILIKE $${p.push(`%${q}%`)} OR email ILIKE $${p.length})`;
    if (role) query += ` AND role=$${p.push(role)}`;
    query += " ORDER BY created_at DESC LIMIT 100";
    res.json(await db.many(query, p));
  } catch (err) { next(err); }
});

router.put("/users/:id/role", async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!["user","admin","tutor"].includes(role))
      return res.status(400).json({ error: "Invalid role" });
    await db.query("UPDATE users SET role=$1 WHERE id=$2", [role, req.params.id]);
    res.json({ message: `Role updated to ${role}` });
  } catch (err) { next(err); }
});

router.delete("/users/:id", async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
    await db.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ message: "User deleted" });
  } catch (err) { next(err); }
});

// ── Content Management ────────────────────────────────────────────────────────

router.get("/content/all", async (req, res, next) => {
  try {
    const tree = await db.many(
      `SELECT s.id AS subject_id, s.name AS subject,
              t.id AS topic_id, t.name AS topic,
              st.id AS subtopic_id, st.name AS subtopic,
              COUNT(l.id)::int AS lesson_count,
              COUNT(l.id) FILTER (WHERE l.is_published)::int AS published
       FROM subjects s
       LEFT JOIN topics t ON t.subject_id=s.id
       LEFT JOIN subtopics st ON st.topic_id=t.id
       LEFT JOIN lessons l ON l.subtopic_id=st.id
       GROUP BY s.id, s.name, t.id, t.name, st.id, st.name
       ORDER BY s.name, t.order_index, st.order_index`
    );
    res.json(tree);
  } catch (err) { next(err); }
});

router.get("/content/drafts", async (req, res, next) => {
  try {
    const drafts = await db.many(
      `SELECT l.id, l.title, l.updated_at, st.name AS subtopic, t.name AS topic, s.name AS subject
       FROM lessons l
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       JOIN subjects s ON s.id=t.subject_id
       WHERE l.is_published=false ORDER BY l.updated_at DESC`
    );
    res.json(drafts);
  } catch (err) { next(err); }
});

// Bulk publish/unpublish
router.put("/content/lessons/bulk-publish", async (req, res, next) => {
  try {
    const { ids, publish } = req.body;
    await db.query(
      `UPDATE lessons SET is_published=$1 WHERE id=ANY($2::uuid[])`,
      [publish ?? true, ids]
    );
    res.json({ message: `${ids.length} lessons ${publish ? "published" : "unpublished"}` });
  } catch (err) { next(err); }
});

// ── Flashcard Management ──────────────────────────────────────────────────────

router.get("/flashcards/official", async (req, res, next) => {
  try {
    const decks = await db.many(
      `SELECT fd.*, COUNT(f.id)::int AS card_count FROM flashcard_decks fd
       LEFT JOIN flashcards f ON f.deck_id=fd.id
       WHERE fd.is_official=true GROUP BY fd.id ORDER BY fd.created_at DESC`
    );
    res.json(decks);
  } catch (err) { next(err); }
});

router.put("/flashcards/decks/:id/official", async (req, res, next) => {
  try {
    await db.query("UPDATE flashcard_decks SET is_official=$1 WHERE id=$2", [req.body.official ?? true, req.params.id]);
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// ── Notifications Broadcast ───────────────────────────────────────────────────

router.post("/notifications/broadcast", async (req, res, next) => {
  try {
    const { title, body, type = "announcement", userIds } = req.body;
    let ids = userIds;
    if (!ids) {
      const users = await db.many("SELECT id FROM users");
      ids = users.map(u => u.id);
    }
    for (const uid of ids) {
      await db.query(
        "INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4)",
        [uid, type, title, body]
      );
    }
    req.app.get("io").emit("notification", { type, title, body });
    res.json({ message: `Notification sent to ${ids.length} users` });
  } catch (err) { next(err); }
});

// ── Forum Moderation ──────────────────────────────────────────────────────────

router.get("/forum/flagged", async (req, res, next) => {
  try {
    const posts = await db.many(
      `SELECT fp.*, u.username, u.email FROM forum_posts fp
       JOIN users u ON u.id=fp.user_id
       WHERE fp.is_flagged=true ORDER BY fp.created_at DESC`
    );
    res.json(posts);
  } catch (err) { next(err); }
});

router.delete("/forum/:id", async (req, res, next) => {
  try {
    await db.query("DELETE FROM forum_posts WHERE id=$1", [req.params.id]);
    res.json({ message: "Post deleted" });
  } catch (err) { next(err); }
});

router.put("/forum/:id/unflag", async (req, res, next) => {
  try {
    await db.query("UPDATE forum_posts SET is_flagged=false WHERE id=$1", [req.params.id]);
    res.json({ message: "Post cleared" });
  } catch (err) { next(err); }
});

module.exports = router;
