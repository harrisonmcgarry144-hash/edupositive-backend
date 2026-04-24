const router = require("express").Router();
const db     = require('./index');
const { authenticate, optionalAuth, requireAdmin } = require('./authmiddleware');

router.get("/subjects", optionalAuth, async (req, res, next) => {
  try {
    const { levelType } = req.query;
    const subjects = levelType
      ? await db.many("SELECT * FROM subjects WHERE level_type=$1 ORDER BY name", [levelType])
      : await db.many("SELECT * FROM subjects ORDER BY name");
    res.json(subjects);
  } catch (err) { next(err); }
});

router.get("/subjects/:id/topics", optionalAuth, async (req, res, next) => {
  try {
    const topics = await db.many(
      `SELECT t.*,
         COALESCE(json_agg(
           json_build_object('id',s.id,'name',s.name,'slug',s.slug,'order_index',s.order_index)
           ORDER BY s.order_index
         ) FILTER (WHERE s.id IS NOT NULL), '[]') AS subtopics
       FROM topics t
       LEFT JOIN subtopics s ON s.topic_id=t.id
       WHERE t.subject_id=$1
       GROUP BY t.id ORDER BY t.order_index`,
      [req.params.id]
    );
    res.json(topics);
  } catch (err) { next(err); }
});

router.get("/topics/:id/subtopics", optionalAuth, async (req, res, next) => {
  try {
    const subtopics = await db.many("SELECT * FROM subtopics WHERE topic_id=$1 ORDER BY order_index", [req.params.id]);
    res.json(subtopics);
  } catch (err) { next(err); }
});

router.get("/subtopics/:id/lessons", optionalAuth, async (req, res, next) => {
  try {
    // Return lessons for any exam board - show AQA as fallback if user's board not available
    const { board } = req.query;
    let lessons;
    if (board) {
      // Try user's board first, fall back to AQA
      lessons = await db.many(
        `SELECT id, title, summary, keywords, exam_board, created_at FROM lessons
         WHERE subtopic_id=$1 AND is_published=true AND exam_board=$2 ORDER BY created_at`,
        [req.params.id, board]
      );
      if (lessons.length === 0) {
        lessons = await db.many(
          `SELECT id, title, summary, keywords, exam_board, created_at FROM lessons
           WHERE subtopic_id=$1 AND is_published=true ORDER BY created_at`,
          [req.params.id]
        );
      }
    } else {
      lessons = await db.many(
        `SELECT id, title, summary, keywords, exam_board, created_at FROM lessons
         WHERE subtopic_id=$1 AND is_published=true ORDER BY created_at`,
        [req.params.id]
      );
    }
    res.json(lessons);
  } catch (err) { next(err); }
});

router.get("/lessons/:id", optionalAuth, async (req, res, next) => {
  try {
    const lesson = await db.one(
      `SELECT l.*, st.name AS subtopic_name, t.name AS topic_name, s.name AS subject_name, t.id AS topic_id, s.id AS subject_id
       FROM lessons l
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       JOIN subjects s ON s.id=t.subject_id
       WHERE l.id=$1 AND l.is_published=true`,
      [req.params.id]
    );
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    const modelAnswers = await db.many("SELECT * FROM model_answers WHERE lesson_id=$1", [req.params.id]);
    if (req.user) {
      await db.query(`INSERT INTO memory_strength (user_id, subtopic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, lesson.subtopic_id]);
      await require('./gamification').awardXP(req.user.id, 15, "lesson_read", lesson.id);
    }
    res.json({ ...lesson, modelAnswers });
  } catch (err) { next(err); }
});

router.get("/subtopics/:id/mindmap", authenticate, async (req, res, next) => {
  try {
    const subtopic = await db.one("SELECT * FROM subtopics WHERE id=$1", [req.params.id]);
    if (!subtopic) return res.status(404).json({ error: "Subtopic not found" });
    const lessons = await db.many("SELECT id, title, keywords, summary FROM lessons WHERE subtopic_id=$1 AND is_published=true", [req.params.id]);
    res.json({
      id: subtopic.id, label: subtopic.name,
      children: lessons.map(l => ({
        id: l.id, label: l.title,
        children: (l.keywords || []).map((kw, i) => ({ id: `${l.id}-kw-${i}`, label: kw, type: "keyword" })),
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/content/lessons/:id/paragraph-quiz — uses Groq (fast, free tier)
router.post("/lessons/:id/paragraph-quiz", authenticate, async (req, res, next) => {
  try {
    const { paragraph } = req.body;
    if (!paragraph?.trim()) return res.status(400).json({ error: "paragraph required" });

    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 400,
      messages: [
        { role: "system", content: "You create quick-check multiple choice questions for A-Level students. Return only valid JSON." },
        { role: "user", content: `Generate one multiple choice question based on this paragraph.\n\nPARAGRAPH: ${paragraph}\n\nReturn ONLY valid JSON with no markdown:\n{ "question": "...", "options": ["option A", "option B", "option C", "option D"], "correctIndex": 0, "answer": "1-2 sentence explanation of the correct answer" }` }
      ],
    });

    const text = completion.choices[0].message.content;
    const cleaned = text.replace(/\`\`\`json|\`\`\`/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    res.json(JSON.parse(match ? match[0] : cleaned));
  } catch (err) { next(err); }
});

router.post("/lessons/:id/complete", authenticate, async (req, res, next) => {
  try {
    await db.query(`INSERT INTO lesson_completions (user_id, lesson_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.user.id, req.params.id]);
    res.json({ message: "Lesson marked complete" });
  } catch (err) { next(err); }
});

router.get("/my-progress", authenticate, async (req, res, next) => {
  try {
    const rows = await db.many(
      `SELECT s.id AS subject_id, t.id AS topic_id, st.id AS subtopic_id,
              COUNT(l.id) AS total_lessons, COUNT(lc.id) AS completed_lessons
       FROM subjects s
       JOIN user_subjects us ON us.subject_id=s.id AND us.user_id=$1
       JOIN topics t ON t.subject_id=s.id
       JOIN subtopics st ON st.topic_id=t.id
       LEFT JOIN lessons l ON l.subtopic_id=st.id AND l.is_published=true
       LEFT JOIN lesson_completions lc ON lc.lesson_id=l.id AND lc.user_id=$1
       GROUP BY s.id, t.id, st.id`,
      [req.user.id]
    );
    const progress = {};
    for (const r of rows) {
      if (!progress[r.subject_id]) progress[r.subject_id] = { topics: {}, subtopics: {} };
      if (!progress[r.subject_id].topics[r.topic_id]) progress[r.subject_id].topics[r.topic_id] = { total: 0, completed: 0 };
      progress[r.subject_id].topics[r.topic_id].total += parseInt(r.total_lessons);
      progress[r.subject_id].topics[r.topic_id].completed += parseInt(r.completed_lessons);
      progress[r.subject_id].subtopics[r.subtopic_id] = r.total_lessons > 0 ? Math.round(r.completed_lessons / r.total_lessons * 100) : 0;
    }
    for (const sid of Object.keys(progress)) {
      const topics = progress[sid].topics;
      const pcts = Object.values(topics).map(t => t.total > 0 ? Math.round(t.completed/t.total*100) : 0);
      progress[sid].subjectPct = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length) : 0;
      for (const tid of Object.keys(topics)) {
        const t = topics[tid];
        progress[sid].topics[tid] = t.total > 0 ? Math.round(t.completed/t.total*100) : 0;
      }
    }
    res.json(progress);
  } catch (err) { next(err); }
});

// Admin routes
router.post("/subjects", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, slug, icon, color, levelType, description } = req.body;
    if (!name || !slug) return res.status(400).json({ error: "name and slug required" });
    const row = await db.one(`INSERT INTO subjects (name, slug, icon, color, level_type, description, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name, slug, icon||null, color||null, levelType||null, description||null, req.user.id]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.post("/topics", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { subjectId, name, slug, orderIndex } = req.body;
    const row = await db.one(`INSERT INTO topics (subject_id, name, slug, order_index, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [subjectId, name, slug, orderIndex||0, req.user.id]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.post("/subtopics", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { topicId, name, slug, orderIndex } = req.body;
    const row = await db.one(`INSERT INTO subtopics (topic_id, name, slug, order_index, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [topicId, name, slug, orderIndex||0, req.user.id]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.post("/lessons", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { subtopicId, title, content, summary, keywords, isPublished } = req.body;
    const row = await db.one(`INSERT INTO lessons (subtopic_id, title, content, summary, keywords, is_published, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`, [subtopicId, title, content, summary||null, keywords||[], isPublished??false, req.user.id]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.put("/lessons/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const current = await db.one("SELECT * FROM lessons WHERE id=$1", [req.params.id]);
    if (!current) return res.status(404).json({ error: "Lesson not found" });
    await db.query("INSERT INTO lesson_versions (lesson_id, content, version, edited_by) VALUES ($1,$2,$3,$4)", [req.params.id, current.content, current.version, req.user.id]);
    const { title, content, summary, keywords, isPublished } = req.body;
    const row = await db.one(
      `UPDATE lessons SET title=COALESCE($1,title), content=COALESCE($2,content), summary=COALESCE($3,summary), keywords=COALESCE($4,keywords), is_published=COALESCE($5,is_published), version=version+1, updated_by=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [title, content, summary, keywords, isPublished, req.user.id, req.params.id]
    );
    res.json(row);
  } catch (err) { next(err); }
});

router.delete("/lessons/:id", authenticate, requireAdmin, async (req, res, next) => {
  try { await db.query("DELETE FROM lessons WHERE id=$1", [req.params.id]); res.json({ message: "Lesson deleted" }); } catch (err) { next(err); }
});
router.delete("/subtopics/:id", authenticate, requireAdmin, async (req, res, next) => {
  try { await db.query("DELETE FROM subtopics WHERE id=$1", [req.params.id]); res.json({ message: "Subtopic deleted" }); } catch (err) { next(err); }
});
router.delete("/topics/:id", authenticate, requireAdmin, async (req, res, next) => {
  try { await db.query("DELETE FROM topics WHERE id=$1", [req.params.id]); res.json({ message: "Topic deleted" }); } catch (err) { next(err); }
});
router.delete("/subjects/:id", authenticate, requireAdmin, async (req, res, next) => {
  try { await db.query("DELETE FROM subjects WHERE id=$1", [req.params.id]); res.json({ message: "Subject deleted" }); } catch (err) { next(err); }
});

router.post("/model-answers", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { lessonId, title, content, grade, marks, annotations } = req.body;
    const row = await db.one(`INSERT INTO model_answers (lesson_id, title, content, grade, marks, annotations, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [lessonId, title, content, grade||null, marks||null, annotations||null, req.user.id]);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

router.get("/lessons/:id/versions", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const versions = await db.many("SELECT * FROM lesson_versions WHERE lesson_id=$1 ORDER BY version DESC", [req.params.id]);
    res.json(versions);
  } catch (err) { next(err); }
});

module.exports = router;
