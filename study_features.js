const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callGroq(system, user, maxTokens = 1000, model = "llama-3.3-70b-versatile") {
  const res = await groq.chat.completions.create({
    model, max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  return res.choices[0].message.content;
}

// ── Mistake Bank ─────────────────────────────────────────────────────────────

router.post("/mistakes", authenticate, async (req, res, next) => {
  try {
    const { lessonId, subtopicId, question, userAnswer, correctAnswer, questionType } = req.body;
    await db.query(
      `INSERT INTO mistake_bank (user_id, lesson_id, subtopic_id, question, user_answer, correct_answer, question_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [req.user.id, lessonId||null, subtopicId||null, question, userAnswer||null, correctAnswer, questionType||'mcq']
    );
    res.json({ saved: true });
  } catch(err) { next(err); }
});

router.get("/mistakes", authenticate, async (req, res, next) => {
  try {
    const mistakes = await db.many(
      `SELECT mb.*, l.title AS lesson_title, st.name AS subtopic_name, s.name AS subject_name
       FROM mistake_bank mb
       LEFT JOIN lessons l ON l.id = mb.lesson_id
       LEFT JOIN subtopics st ON st.id = mb.subtopic_id
       LEFT JOIN topics t ON t.id = st.topic_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       WHERE mb.user_id = $1 AND mb.resolved = false
       ORDER BY mb.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(mistakes);
  } catch(err) { next(err); }
});

router.put("/mistakes/:id/resolve", authenticate, async (req, res, next) => {
  try {
    await db.query("UPDATE mistake_bank SET resolved=true WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ resolved: true });
  } catch(err) { next(err); }
});

// ── Boss Battle Quiz ──────────────────────────────────────────────────────────

router.post("/boss-battle/:subtopicId", authenticate, async (req, res, next) => {
  try {
    const { subtopicId } = req.params;
    const lessons = await db.many(
      `SELECT l.title, l.content, st.name AS subtopic, s.name AS subject
       FROM lessons l
       JOIN subtopics st ON st.id = l.subtopic_id
       JOIN topics t ON t.id = st.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE l.subtopic_id=$1 AND l.is_published=true`,
      [subtopicId]
    );
    if (!lessons.length) return res.status(404).json({ error: "No lessons found" });
    const { subtopic, subject } = lessons[0];
    const combined = lessons.map(l => `${l.title}:\n${l.content}`).join('\n\n').slice(0, 5000);

    const prompt = `You are an A-Level examiner creating a "boss battle" final quiz for the topic "${subtopic}" in ${subject}.

Create 8 challenging questions that test deep understanding, not just recall. Mix question types.

LESSON CONTENT:
${combined}

Return ONLY valid JSON:
[
  {
    "type": "mcq",
    "question": "...",
    "options": ["A","B","C","D"],
    "correctIndex": 0,
    "explanation": "...",
    "difficulty": "hard",
    "marks": 2
  },
  {
    "type": "short",
    "question": "...",
    "answer": "...",
    "hints": ["hint 1", "hint 2", "hint 3"],
    "explanation": "...",
    "difficulty": "medium",
    "marks": 3
  },
  {
    "type": "error_spot",
    "question": "What is wrong with this statement: ...",
    "wrongStatement": "...",
    "answer": "...",
    "explanation": "...",
    "difficulty": "hard",
    "marks": 2
  }
]

Include a mix of mcq (4), short (2), error_spot (2). Make questions exam-style.`;

    const text = await callGroq(
      "You are an expert A-Level examiner. Return only valid JSON arrays.",
      prompt, 2000
    );
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    const questions = JSON.parse(match ? match[0] : cleaned);
    res.json({ questions, subtopic, subject });
  } catch(err) { next(err); }
});

// ── Adaptive Difficulty ────────────────────────────────────────────────────────

router.post("/performance", authenticate, async (req, res, next) => {
  try {
    const { subtopicId, correct, total, timeSpent } = req.body;
    await db.query(
      `INSERT INTO study_performance (user_id, subtopic_id, correct, total, time_spent_secs)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, subtopicId, correct, total, timeSpent||0]
    );
    const avg = await db.one(
      `SELECT AVG(correct::float/NULLIF(total,0)) AS avg_score FROM study_performance
       WHERE user_id=$1 AND subtopic_id=$2`,
      [req.user.id, subtopicId]
    );
    const score = Math.round((avg.avg_score || 0) * 100);
    res.json({ score, difficulty: score >= 80 ? 'hard' : score >= 50 ? 'medium' : 'easy' });
  } catch(err) { next(err); }
});

// ── Generate Question Variants ────────────────────────────────────────────────

router.post("/generate-question", authenticate, async (req, res, next) => {
  try {
    const { paragraph, type, difficulty } = req.body;
    if (!paragraph) return res.status(400).json({ error: "paragraph required" });

    const typeInstructions = {
      fillblank: `Create a fill-in-the-blank question. Remove ONE key term from a sentence and ask the student to fill it in. Return: { "type": "fillblank", "sentence": "The ___ is responsible for...", "answer": "key term", "hint": "one word clue", "explanation": "why this term" }`,
      match: `Create a matching exercise with 4 pairs. Return: { "type": "match", "instruction": "Match each term to its definition", "pairs": [{"term": "...", "definition": "..."}] }`,
      order: `Create a sequencing question where students order 4-5 steps. Return: { "type": "order", "question": "Put these steps in the correct order:", "steps": ["step 1", "step 2", "step 3", "step 4"], "correctOrder": [0,1,2,3], "explanation": "..." }`,
      error_spot: `Create an error-spotting question with a plausible but wrong statement. Return: { "type": "error_spot", "question": "What is wrong with this statement?", "wrongStatement": "...", "answer": "...", "explanation": "..." }`,
      mcq: `Create a challenging MCQ with plausible distractors. Return: { "type": "mcq", "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "wrongExplanations": ["why A is wrong", "why B is wrong", "why C is wrong"] }`,
    };

    const instrType = typeInstructions[type] || typeInstructions.mcq;
    const prompt = `Based on this A-Level revision paragraph, create an interactive question.

PARAGRAPH: ${paragraph}

DIFFICULTY: ${difficulty || 'medium'}

${instrType}

Return ONLY the JSON object, no markdown.`;

    const text = await callGroq("You create interactive revision questions. Return only valid JSON.", prompt, 600, "llama-3.1-8b-instant");
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    res.json(JSON.parse(match ? match[0] : cleaned));
  } catch(err) { next(err); }
});

// ── Study Streak & Session ────────────────────────────────────────────────────

router.post("/session/start", authenticate, async (req, res, next) => {
  try {
    const { subtopicId, mode } = req.body;
    const session = await db.one(
      `INSERT INTO study_sessions (user_id, subtopic_id, mode, started_at) VALUES ($1,$2,$3,NOW()) RETURNING id`,
      [req.user.id, subtopicId||null, mode||'learn']
    );
    res.json({ sessionId: session.id });
  } catch(err) { next(err); }
});

router.put("/session/:id/end", authenticate, async (req, res, next) => {
  try {
    const { correct, total, xpEarned } = req.body;
    await db.query(
      `UPDATE study_sessions SET ended_at=NOW(), correct=$1, total=$2, xp_earned=$3,
       duration_mins=EXTRACT(EPOCH FROM (NOW()-started_at))/60 WHERE id=$4 AND user_id=$5`,
      [correct||0, total||0, xpEarned||0, req.params.id, req.user.id]
    );
    res.json({ saved: true });
  } catch(err) { next(err); }
});

// ── Bookmarks ─────────────────────────────────────────────────────────────────

router.post("/bookmarks", authenticate, async (req, res, next) => {
  try {
    const { lessonId, note } = req.body;
    await db.query(
      `INSERT INTO bookmarks (user_id, lesson_id, note) VALUES ($1,$2,$3) ON CONFLICT (user_id, lesson_id) DO UPDATE SET note=$3`,
      [req.user.id, lessonId, note||null]
    );
    res.json({ bookmarked: true });
  } catch(err) { next(err); }
});

router.delete("/bookmarks/:lessonId", authenticate, async (req, res, next) => {
  try {
    await db.query("DELETE FROM bookmarks WHERE user_id=$1 AND lesson_id=$2", [req.user.id, req.params.lessonId]);
    res.json({ bookmarked: false });
  } catch(err) { next(err); }
});

router.get("/bookmarks", authenticate, async (req, res, next) => {
  try {
    const bookmarks = await db.many(
      `SELECT b.*, l.title, st.name AS subtopic, s.name AS subject
       FROM bookmarks b JOIN lessons l ON l.id=b.lesson_id
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       JOIN subjects s ON s.id=t.subject_id
       WHERE b.user_id=$1 ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json(bookmarks);
  } catch(err) { next(err); }
});

module.exports = router;
