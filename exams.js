const router = require("express").Router();
const db     = require('./index');
const { authenticate, requireAdmin } = require('./authmiddleware');
const { awardXP }   = require('./gamification');
const { generateStudySchedule } = require('./scheduler');

// GET /api/exams/boards
router.get("/boards", async (_req, res, next) => {
  try { res.json(await db.many("SELECT * FROM exam_boards ORDER BY name")); }
  catch (err) { next(err); }
});

// GET /api/exams/papers
router.get("/papers", authenticate, async (req, res, next) => {
  try {
    const { subjectId, year, boardId } = req.query;
    let q = `
      SELECT pp.*, s.name AS subject_name, eb.name AS board_name,
             COUNT(eq.id)::int AS question_count
      FROM past_papers pp
      JOIN subjects s ON s.id=pp.subject_id
      LEFT JOIN exam_boards eb ON eb.id=pp.exam_board_id
      LEFT JOIN exam_questions eq ON eq.paper_id=pp.id
      WHERE 1=1`;
    const p = [];
    if (subjectId) q += ` AND pp.subject_id=$${p.push(subjectId)}`;
    if (year)      q += ` AND pp.year=$${p.push(year)}`;
    if (boardId)   q += ` AND pp.exam_board_id=$${p.push(boardId)}`;
    q += " GROUP BY pp.id, s.name, eb.name ORDER BY pp.year DESC, pp.paper_number";
    res.json(await db.many(q, p));
  } catch (err) { next(err); }
});

// GET /api/exams/papers/:id
router.get("/papers/:id", authenticate, async (req, res, next) => {
  try {
    const paper = await db.one(
      `SELECT pp.*, s.name AS subject_name, eb.name AS board_name
       FROM past_papers pp
       LEFT JOIN subjects s ON s.id=pp.subject_id
       LEFT JOIN exam_boards eb ON eb.id=pp.exam_board_id
       WHERE pp.id=$1`,
      [req.params.id]
    );
    if (!paper) return res.status(404).json({ error: "Paper not found" });
    const boundaries = await db.many("SELECT * FROM grade_boundaries WHERE paper_id=$1 ORDER BY min_marks DESC", [req.params.id]);
    res.json({ ...paper, gradeBoundaries: boundaries });
  } catch (err) { next(err); }
});

// GET /api/exams/papers/:id/questions
router.get("/papers/:id/questions", authenticate, async (req, res, next) => {
  try {
    const questions = await db.many(
      `SELECT eq.id, eq.question_number, eq.question_text, eq.marks, eq.difficulty,
              eq.topic_id, t.name AS topic_name
       FROM exam_questions eq
       LEFT JOIN topics t ON t.id=eq.topic_id
       WHERE eq.paper_id=$1 ORDER BY eq.question_number`,
      [req.params.id]
    );
    res.json(questions);
  } catch (err) { next(err); }
});

// POST /api/exams/attempts — start an exam
router.post("/attempts", authenticate, async (req, res, next) => {
  try {
    const { paperId, mode = "practice" } = req.body;
    const attempt = await db.one(
      "INSERT INTO exam_attempts (user_id, paper_id, mode) VALUES ($1,$2,$3) RETURNING *",
      [req.user.id, paperId, mode]
    );
    res.status(201).json(attempt);
  } catch (err) { next(err); }
});

// POST /api/exams/attempts/:id/answer — save one answer
router.post("/attempts/:id/answer", authenticate, async (req, res, next) => {
  try {
    const { questionId, answerText } = req.body;
    const attempt = await db.oneOrNone(
      "SELECT id FROM exam_attempts WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    await db.query(
      `INSERT INTO exam_answers (attempt_id, question_id, answer_text) VALUES ($1,$2,$3)
       ON CONFLICT (attempt_id, question_id) DO UPDATE SET answer_text=$3`,
      [req.params.id, questionId, answerText]
    );
    res.json({ message: "Answer saved" });
  } catch (err) { next(err); }
});

// POST /api/exams/attempts/:id/submit
router.post("/attempts/:id/submit", authenticate, async (req, res, next) => {
  try {
    const { timeTakenSecs } = req.body;
    await db.query(
      "UPDATE exam_attempts SET submitted_at=NOW(), time_taken_secs=$1 WHERE id=$2 AND user_id=$3",
      [timeTakenSecs || null, req.params.id, req.user.id]
    );
    await awardXP(req.user.id, 50, "exam_submitted", req.params.id);
    res.json({ message: "Exam submitted. Use /api/ai/mark to mark each answer." });
  } catch (err) { next(err); }
});

// GET /api/exams/attempts — user's attempt history
router.get("/attempts", authenticate, async (req, res, next) => {
  try {
    const attempts = await db.many(
      `SELECT ea.*, pp.title AS paper_title, pp.year
       FROM exam_attempts ea
       LEFT JOIN past_papers pp ON pp.id=ea.paper_id
       WHERE ea.user_id=$1 ORDER BY ea.started_at DESC`,
      [req.user.id]
    );
    res.json(attempts);
  } catch (err) { next(err); }
});

// GET /api/exams/attempts/:id
router.get("/attempts/:id", authenticate, async (req, res, next) => {
  try {
    const attempt = await db.oneOrNone(
      "SELECT * FROM exam_attempts WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    const answers = await db.many(
      `SELECT ea.*, eq.question_text, eq.marks, eq.question_number
       FROM exam_answers ea
       JOIN exam_questions eq ON eq.id=ea.question_id
       WHERE ea.attempt_id=$1`,
      [req.params.id]
    );
    res.json({ ...attempt, answers });
  } catch (err) { next(err); }
});

// GET /api/exams/schedule — user's registered exam dates
router.get("/schedule", authenticate, async (req, res, next) => {
  try {
    const exams = await db.many(
      `SELECT ue.*, s.name AS subject_name
       FROM user_exams ue
       LEFT JOIN subjects s ON s.id=ue.subject_id
       WHERE ue.user_id=$1 ORDER BY ue.exam_date`,
      [req.user.id]
    );
    res.json(exams);
  } catch (err) { next(err); }
});

// POST /api/exams/schedule
router.post("/schedule", authenticate, async (req, res, next) => {
  try {
    const { subjectId, paperName, examDate, durationMins, board } = req.body;
    if (!examDate) return res.status(400).json({ error: "examDate required" });
    const exam = await db.one(
      `INSERT INTO user_exams (user_id, subject_id, paper_name, exam_date, duration_mins, board)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, subjectId || null, paperName || null, examDate, durationMins || 120, board || null]
    );
    await generateStudySchedule(req.user.id);
    res.status(201).json(exam);
  } catch (err) { next(err); }
});

// DELETE /api/exams/schedule/:id
router.delete("/schedule/:id", authenticate, async (req, res, next) => {
  try {
    await db.query("DELETE FROM user_exams WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ message: "Exam removed" });
  } catch (err) { next(err); }
});

// ── Admin: manage papers and questions ────────────────────────────────────────

router.post("/papers", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { subjectId, examBoardId, year, paperNumber, title, totalMarks, durationMins } = req.body;
    const paper = await db.one(
      `INSERT INTO past_papers (subject_id, exam_board_id, year, paper_number, title, total_marks, duration_mins, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [subjectId, examBoardId || null, year, paperNumber, title || null, totalMarks || null, durationMins || null, req.user.id]
    );
    res.status(201).json(paper);
  } catch (err) { next(err); }
});

router.post("/questions", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { paperId, topicId, subtopicId, questionText, questionNumber, marks, difficulty, markScheme, modelAnswer } = req.body;
    const q = await db.one(
      `INSERT INTO exam_questions
         (paper_id, topic_id, subtopic_id, question_text, question_number, marks, difficulty, mark_scheme, model_answer, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [paperId, topicId || null, subtopicId || null, questionText, questionNumber || null, marks, difficulty || null, markScheme || null, modelAnswer || null, req.user.id]
    );
    res.status(201).json(q);
  } catch (err) { next(err); }
});

router.post("/papers/:id/grade-boundaries", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { boundaries } = req.body; // [{ grade, minMarks, maxMarks }]
    for (const b of boundaries) {
      await db.query(
        "INSERT INTO grade_boundaries (paper_id, grade, min_marks, max_marks) VALUES ($1,$2,$3,$4)",
        [req.params.id, b.grade, b.minMarks, b.maxMarks]
      );
    }
    res.json({ message: "Grade boundaries saved" });
  } catch (err) { next(err); }
});
// DELETE /api/exams/papers/:id
router.delete("/papers/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    await db.query("DELETE FROM past_papers WHERE id=$1", [req.params.id]);
    res.json({ message: "Paper deleted" });
  } catch (err) { next(err); }
});
module.exports = router;
