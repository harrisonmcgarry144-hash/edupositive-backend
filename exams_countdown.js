// Add to existing exams.js or create new file
const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');

// GET /api/exams/countdown
router.get("/countdown", authenticate, async (req, res, next) => {
  try {
    const exams = await db.many(
      `SELECT * FROM user_exams WHERE user_id=$1 AND exam_date >= CURRENT_DATE ORDER BY exam_date ASC`,
      [req.user.id]
    ).catch(() => []);
    const now = new Date();
    const withDays = exams.map(e => ({
      ...e,
      daysUntil: Math.ceil((new Date(e.exam_date) - now) / (1000 * 60 * 60 * 24))
    }));
    res.json(withDays);
  } catch (err) { next(err); }
});

// POST /api/exams/countdown
router.post("/countdown", authenticate, async (req, res, next) => {
  try {
    const { subjectName, examBoard, examDate, paperName } = req.body;
    if (!subjectName || !examDate) return res.status(400).json({ error: "subjectName and examDate required" });
    const exam = await db.one(
      `INSERT INTO user_exams (user_id, subject_name, exam_board, exam_date, paper_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, subjectName, examBoard || null, examDate, paperName || null]
    );
    res.status(201).json(exam);
  } catch (err) { next(err); }
});

// DELETE /api/exams/countdown/:id
router.delete("/countdown/:id", authenticate, async (req, res, next) => {
  try {
    await db.query("DELETE FROM user_exams WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ message: "Exam removed" });
  } catch (err) { next(err); }
});

module.exports = router;
