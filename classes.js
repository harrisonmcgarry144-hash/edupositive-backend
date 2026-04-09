const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const crypto = require('crypto');

function requireTeacher(req, res, next) {
  if (req.user.role !== 'teacher' && req.user.role !== 'admin')
    return res.status(403).json({ error: "Teacher access required" });
  next();
}

// Generate a short invite code
function genCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ── Teacher routes ────────────────────────────────────────────────────────────

// POST /api/classes — create a class
router.post("/", authenticate, requireTeacher, async (req, res, next) => {
  try {
    const { name, description, subjectId } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const code = genCode();
    const cls = await db.one(
      `INSERT INTO classes (name, description, teacher_id, invite_code, subject_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, description || null, req.user.id, code, subjectId || null]
    );
    res.status(201).json(cls);
  } catch (err) { next(err); }
});

// GET /api/classes — get teacher's classes
router.get("/", authenticate, async (req, res, next) => {
  try {
    let classes;
    if (req.user.role === 'teacher' || req.user.role === 'admin') {
      classes = await db.many(
        `SELECT c.*, s.name AS subject_name,
                COUNT(DISTINCT cm.user_id)::int AS student_count
         FROM classes c
         LEFT JOIN subjects s ON s.id=c.subject_id
         LEFT JOIN class_members cm ON cm.class_id=c.id
         WHERE c.teacher_id=$1
         GROUP BY c.id, s.name
         ORDER BY c.created_at DESC`,
        [req.user.id]
      );
    } else {
      // Students see their enrolled classes
      classes = await db.many(
        `SELECT c.*, s.name AS subject_name, u.username AS teacher_name,
                COUNT(DISTINCT cm2.user_id)::int AS student_count
         FROM classes c
         JOIN class_members cm ON cm.class_id=c.id AND cm.user_id=$1
         LEFT JOIN subjects s ON s.id=c.subject_id
         LEFT JOIN users u ON u.id=c.teacher_id
         LEFT JOIN class_members cm2 ON cm2.class_id=c.id
         GROUP BY c.id, s.name, u.username
         ORDER BY c.created_at DESC`,
        [req.user.id]
      );
    }
    res.json(classes);
  } catch (err) { next(err); }
});

// GET /api/classes/:id — get class details
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const cls = await db.one(
      `SELECT c.*, s.name AS subject_name, u.username AS teacher_name
       FROM classes c
       LEFT JOIN subjects s ON s.id=c.subject_id
       LEFT JOIN users u ON u.id=c.teacher_id
       WHERE c.id=$1`,
      [req.params.id]
    );
    if (!cls) return res.status(404).json({ error: "Class not found" });

    const members = await db.many(
      `SELECT u.id, u.username, u.xp, u.level, u.streak, u.avatar_url,
              COUNT(ac.id)::int AS completed_assignments
       FROM class_members cm
       JOIN users u ON u.id=cm.user_id
       LEFT JOIN assignment_completions ac ON ac.user_id=u.id
         AND ac.assignment_id IN (SELECT id FROM assignments WHERE class_id=$1)
       WHERE cm.class_id=$1
       GROUP BY u.id
       ORDER BY u.xp DESC`,
      [req.params.id]
    );

    const assignments = await db.many(
      `SELECT a.*,
              COUNT(ac.id)::int AS completed_count,
              (SELECT COUNT(*) FROM class_members WHERE class_id=$1)::int AS total_students
       FROM assignments a
       LEFT JOIN assignment_completions ac ON ac.assignment_id=a.id
       WHERE a.class_id=$1
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [req.params.id]
    );

    res.json({ ...cls, members, assignments });
  } catch (err) { next(err); }
});

// DELETE /api/classes/:id
router.delete("/:id", authenticate, requireTeacher, async (req, res, next) => {
  try {
    await db.query("DELETE FROM classes WHERE id=$1 AND teacher_id=$2", [req.params.id, req.user.id]);
    res.json({ message: "Class deleted" });
  } catch (err) { next(err); }
});

// POST /api/classes/join — student joins with invite code
router.post("/join", authenticate, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Invite code required" });

    const cls = await db.one("SELECT * FROM classes WHERE invite_code=$1", [code.toUpperCase()]);
    if (!cls) return res.status(404).json({ error: "Invalid invite code" });

    await db.query(
      "INSERT INTO class_members (class_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [cls.id, req.user.id]
    );
    res.json({ message: "Joined class!", class: cls });
  } catch (err) { next(err); }
});

// POST /api/classes/:id/invite — teacher invites student by username
router.post("/:id/invite", authenticate, requireTeacher, async (req, res, next) => {
  try {
    const { username } = req.body;
    const student = await db.one("SELECT id FROM users WHERE username=$1", [username]);
    if (!student) return res.status(404).json({ error: "User not found" });

    await db.query(
      "INSERT INTO class_members (class_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [req.params.id, student.id]
    );
    res.json({ message: `${username} added to class` });
  } catch (err) { next(err); }
});

// DELETE /api/classes/:id/members/:userId — remove student
router.delete("/:id/members/:userId", authenticate, requireTeacher, async (req, res, next) => {
  try {
    await db.query(
      "DELETE FROM class_members WHERE class_id=$1 AND user_id=$2",
      [req.params.id, req.params.userId]
    );
    res.json({ message: "Student removed" });
  } catch (err) { next(err); }
});

// ── Assignments ────────────────────────────────────────────────────────────────

// POST /api/classes/:id/assignments
router.post("/:id/assignments", authenticate, requireTeacher, async (req, res, next) => {
  try {
    const { title, description, type, resourceId, dueDate } = req.body;
    if (!title || !type) return res.status(400).json({ error: "Title and type required" });

    const assignment = await db.one(
      `INSERT INTO assignments (class_id, created_by, title, description, type, resource_id, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, req.user.id, title, description || null, type, resourceId || null, dueDate || null]
    );
    res.status(201).json(assignment);
  } catch (err) { next(err); }
});

// GET /api/classes/:id/assignments — get assignments for a class
router.get("/:id/assignments", authenticate, async (req, res, next) => {
  try {
    const assignments = await db.many(
      `SELECT a.*,
              EXISTS(
                SELECT 1 FROM assignment_completions ac
                WHERE ac.assignment_id=a.id AND ac.user_id=$1
              ) AS completed
       FROM assignments a
       WHERE a.class_id=$2
       ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
      [req.user.id, req.params.id]
    );
    res.json(assignments);
  } catch (err) { next(err); }
});

// POST /api/classes/assignments/:id/complete
router.post("/assignments/:id/complete", authenticate, async (req, res, next) => {
  try {
    await db.query(
      "INSERT INTO assignment_completions (assignment_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [req.params.id, req.user.id]
    );
    res.json({ message: "Assignment marked complete" });
  } catch (err) { next(err); }
});

// DELETE /api/classes/assignments/:id
router.delete("/assignments/:id", authenticate, requireTeacher, async (req, res, next) => {
  try {
    await db.query("DELETE FROM assignments WHERE id=$1 AND created_by=$2", [req.params.id, req.user.id]);
    res.json({ message: "Assignment deleted" });
  } catch (err) { next(err); }
});

// GET /api/classes/:id/leaderboard
router.get("/:id/leaderboard", authenticate, async (req, res, next) => {
  try {
    const members = await db.many(
      `SELECT u.id, u.username, u.xp, u.level, u.streak, u.avatar_url,
              COUNT(ac.id)::int AS completed_assignments,
              (u.id = $1) AS "isMe"
       FROM class_members cm
       JOIN users u ON u.id=cm.user_id
       LEFT JOIN assignment_completions ac ON ac.user_id=u.id
         AND ac.assignment_id IN (SELECT id FROM assignments WHERE class_id=$2)
       WHERE cm.class_id=$2
       GROUP BY u.id
       ORDER BY u.xp DESC`,
      [req.user.id, req.params.id]
    );
    res.json(members.map((m, i) => ({ ...m, rank: i + 1 })));
  } catch (err) { next(err); }
});

module.exports = router;
