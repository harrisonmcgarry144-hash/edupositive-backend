const router    = require("express").Router();
const Anthropic = require("@anthropic-ai/sdk");
const rateLimit = require("express-rate-limit");
const db        = require('./index');
const { authenticate } = require('./authmiddleware');
const { awardXP }     = require('./gamification');

const client  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const aiLimit = rateLimit({ windowMs: 60_000, max: 30, message: { error: "AI rate limit — wait a moment" } });

const PERSONALITIES = {
  friendly:     "You are warm, encouraging, and make learning enjoyable. Use simple language and relatable analogies.",
  strict:       "You are a rigorous examiner. Be direct, precise, and hold the student to the highest standards.",
  motivational: "You are an inspiring coach. Balance high expectations with genuine encouragement.",
  socratic:     "Use the Socratic method exclusively. Never give direct answers — guide students with targeted questions.",
};
const MODES = {
  normal: "Give clear, thorough explanations.",
  eli5:   "Explain as if the student is 5 years old. Use analogies and very simple words.",
  exam:   "Give exam-focused, mark-scheme-aligned answers. Use precise terminology and structure your response as a model answer.",
};

async function callClaude(system, messages, maxTokens = 1000) {
  const res = await client.messages.create({
    model: "claude-opus-4-5", max_tokens: maxTokens, system,
    messages,
  });
  return res.content[0].text;
}

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

// POST /api/ai/chat
router.post("/chat", authenticate, aiLimit, async (req, res, next) => {
  try {
    const { message, sessionId, mode = "normal", personality = "friendly", topicId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "message required" });

    // Load or create session
    let session = sessionId
      ? await db.one("SELECT * FROM chat_sessions WHERE id=$1 AND user_id=$2", [sessionId, req.user.id])
      : null;
    if (!session) {
      session = await db.one(
        "INSERT INTO chat_sessions (user_id, topic_id, mode, personality) VALUES ($1,$2,$3,$4) RETURNING *",
        [req.user.id, topicId || null, mode, personality]
      );
    }

    const history = await db.many(
      "SELECT role, content FROM chat_messages WHERE session_id=$1 ORDER BY created_at DESC LIMIT 20",
      [session.id]
    );

    // Get user's subjects
    const userSubjects = await db.many(
      `SELECT s.name FROM subjects s
       JOIN user_subjects us ON us.subject_id=s.id
       WHERE us.user_id=$1`,
      [req.user.id]
    );
    const subjectNames = userSubjects.map(s => s.name).join(", ");

    // Search for relevant lesson content based on the message
    let lessonContext = "";
    try {
      const relevantLessons = await db.many(
        `SELECT l.title, l.content, l.summary, st.name AS subtopic, t.name AS topic, s.name AS subject
         FROM lessons l
         JOIN subtopics st ON st.id=l.subtopic_id
         JOIN topics t ON t.id=st.topic_id
         JOIN subjects s ON s.id=t.subject_id
         JOIN user_subjects us ON us.subject_id=s.id AND us.user_id=$1
         WHERE l.is_published=true
         AND (
           l.title ILIKE $2 OR
           l.content ILIKE $2 OR
           l.summary ILIKE $2 OR
           st.name ILIKE $2 OR
           t.name ILIKE $2
         )
         LIMIT 3`,
        [req.user.id, `%${message.slice(0, 50)}%`]
      );

      if (relevantLessons.length > 0) {
        lessonContext = "\n\nRELEVANT LESSON CONTENT FROM THE CURRICULUM:\n" +
          relevantLessons.map(l =>
            `[${l.subject} > ${l.topic} > ${l.subtopic}]\nTitle: ${l.title}\n${l.summary || l.content.slice(0, 600)}`
          ).join("\n\n---\n\n");
      }
    } catch(e) { /* ignore lesson fetch errors */ }

    // Topic context if provided
    let topicCtx = "";
    if (topicId) {
      const topic = await db.one(
        "SELECT t.name, s.name AS subject FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE t.id=$1",
        [topicId]
      ).catch(() => null);
      if (topic) topicCtx = `\nCurrent topic: ${topic.name} (${topic.subject})`;
    }

    const system = `You are EduPositive's AI tutor — a specialist A-Level revision assistant.

STUDENT'S SUBJECTS: ${subjectNames || "Not set"}
${PERSONALITIES[personality] || PERSONALITIES.friendly}
${MODES[mode] || MODES.normal}${topicCtx}

IMPORTANT RULES:
- Only answer questions related to the student's A-Level subjects: ${subjectNames || "their subjects"}
- If asked about something outside their subjects, politely redirect them to their own subjects
- Base your answers on the lesson content provided below when available
- Use UK A-Level terminology and refer to the relevant exam board specifications
- If lesson content is provided, prioritise it as the source of truth
- Keep responses concise and well-structured${lessonContext}`;

    const reply = await callClaude(system, [
      ...history.reverse().map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ]);

    await db.query("INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'user',$2)", [session.id, message]);
    await db.query("INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'assistant',$2)", [session.id, reply]);
    await awardXP(req.user.id, 5, "ai_chat");

    res.json({ reply, sessionId: session.id });
  } catch (err) { next(err); }
});

// GET /api/ai/sessions
router.get("/sessions", authenticate, async (req, res, next) => {
  try {
    const sessions = await db.many(
      `SELECT cs.*, t.name AS topic_name, COUNT(cm.id)::int AS message_count
       FROM chat_sessions cs
       LEFT JOIN topics t ON t.id=cs.topic_id
       LEFT JOIN chat_messages cm ON cm.session_id=cs.id
       WHERE cs.user_id=$1
       GROUP BY cs.id, t.name ORDER BY cs.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(sessions);
  } catch (err) { next(err); }
});

// GET /api/ai/sessions/:id/messages
router.get("/sessions/:id/messages", authenticate, async (req, res, next) => {
  try {
    const session = await db.one("SELECT id FROM chat_sessions WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const messages = await db.many(
      "SELECT * FROM chat_messages WHERE session_id=$1 ORDER BY created_at",
      [req.params.id]
    );
    res.json(messages);
  } catch (err) { next(err); }
});

// POST /api/ai/mark
router.post("/mark", authenticate, aiLimit, async (req, res, next) => {
  try {
    const { questionId, attemptId, answerText } = req.body;
    const question = await db.one("SELECT * FROM exam_questions WHERE id=$1", [questionId]);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const prompt = `You are a strict UK examiner marking a student answer.

QUESTION: ${question.question_text}
MARKS AVAILABLE: ${question.marks}
MARK SCHEME: ${question.mark_scheme || "Use subject knowledge to mark accurately."}
MODEL ANSWER: ${question.model_answer || "Not provided."}
STUDENT ANSWER: ${answerText}

Respond ONLY with valid JSON:
{
  "marksAwarded": <0-${question.marks}>,
  "feedback": "<specific, actionable 2-3 sentence feedback>",
  "strengths": ["<point>"],
  "improvements": ["<point>"],
  "keyPointsMissed": ["<point>"],
  "examTechnique": "<one sentence on exam technique>"
}`;

    const text   = await callClaude("You are an expert examiner.", [{ role:"user", content: prompt }], 800);
    const result = parseJSON(text) || { marksAwarded: 0, feedback: text };

    if (attemptId) {
      await db.query(
        `UPDATE exam_answers SET marks_awarded=$1, ai_feedback=$2, ai_marked_at=NOW()
         WHERE attempt_id=$3 AND question_id=$4`,
        [result.marksAwarded, JSON.stringify(result), attemptId, questionId]
      );
    }
    await awardXP(req.user.id, 20, "exam_answer_marked", questionId);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/ai/blurt
router.post("/blurt", authenticate, aiLimit, async (req, res, next) => {
  try {
    const { subtopicId, userText } = req.body;
    if (!subtopicId || !userText?.trim()) return res.status(400).json({ error: "subtopicId and userText required" });

    const lessons = await db.many(
      "SELECT title, summary, content, keywords FROM lessons WHERE subtopic_id=$1 AND is_published=true",
      [subtopicId]
    );
    if (!lessons.length) return res.status(404).json({ error: "No content for this subtopic" });

    const core = lessons.map(l => `${l.title}: ${l.summary || l.content.slice(0,500)}`).join("\n\n");
    const keys = [...new Set(lessons.flatMap(l => l.keywords || []))].join(", ");

    const prompt = `You are evaluating a student's memory recall (blurting exercise).

CORE CONTENT: ${core}
KEY TERMS: ${keys}
STUDENT RECALL: ${userText}

Respond ONLY with valid JSON:
{
  "score": <0-100>,
  "missingKeyPoints": ["<important points not mentioned>"],
  "incorrectIdeas": ["<things stated incorrectly>"],
  "weakAreas": ["<concepts touched on but shallow>"],
  "wellRecalled": ["<accurately recalled points>"],
  "knowledgeGapReport": "<2-3 sentence gap summary>",
  "nextSteps": ["<specific things to revisit>"]
}`;

    const text   = await callClaude("You are an educational assessment expert.", [{ role:"user", content: prompt }]);
    const result = parseJSON(text) || { score: 0, knowledgeGapReport: text };

    const session = await db.one(
      `INSERT INTO blurt_sessions (user_id, subtopic_id, user_text, ai_feedback, score)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.user.id, subtopicId, userText, JSON.stringify(result), result.score || 0]
    );

    await upsertMemoryStrength(req.user.id, subtopicId, "blurt_score", result.score || 0);
    await awardXP(req.user.id, 30, "blurt_session", session.id);

    res.json({ ...result, sessionId: session.id });
  } catch (err) { next(err); }
});

// POST /api/ai/feynman
router.post("/feynman", authenticate, aiLimit, async (req, res, next) => {
  try {
    const { subtopicId, explanation } = req.body;
    if (!subtopicId || !explanation?.trim()) return res.status(400).json({ error: "subtopicId and explanation required" });

    const sub = await db.one(
      `SELECT st.name, t.name AS topic, s.name AS subject
       FROM subtopics st JOIN topics t ON t.id=st.topic_id JOIN subjects s ON s.id=t.subject_id
       WHERE st.id=$1`,
      [subtopicId]
    );

    const prompt = `Evaluate this student's Feynman explanation of a concept.

TOPIC: ${sub?.name || "Unknown"} (${sub?.subject || ""})
STUDENT EXPLANATION: ${explanation}

Respond ONLY with valid JSON:
{
  "clarityScore": <0-10>,
  "accuracyScore": <0-10>,
  "depthScore": <0-10>,
  "overallScore": <0-100>,
  "understandingLevel": "<deep|partial|surface|guessing|memorising>",
  "corrections": ["<factual corrections>"],
  "simplifications": ["<overcomplicated parts>"],
  "followUpQuestions": ["<probing questions for weak spots>"],
  "summary": "<2 sentence evaluation>",
  "confidenceDetection": "<does student truly understand or are they guessing?>"
}`;

    const text   = await callClaude("You are an expert educator evaluating student understanding.", [{ role:"user", content: prompt }]);
    const result = parseJSON(text) || { overallScore: 0, summary: text };

    await db.query(
      `INSERT INTO feynman_sessions (user_id, subtopic_id, user_explanation, ai_evaluation, understanding_level)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, subtopicId, explanation, JSON.stringify(result), result.understandingLevel || null]
    );

    await upsertMemoryStrength(req.user.id, subtopicId, "recall_score", result.overallScore || 0);
    await awardXP(req.user.id, 40, "feynman_session");
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/ai/generate-flashcards
router.post("/generate-flashcards", authenticate, aiLimit, async (req, res, next) => {
  try {
    const { lessonId, text, count = 10 } = req.body;
    let content = text;
    if (lessonId) {
      const lesson = await db.one("SELECT content FROM lessons WHERE id=$1", [lessonId]);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      content = lesson.content;
    }
    if (!content?.trim()) return res.status(400).json({ error: "lessonId or text required" });

    const prompt = `Generate exactly ${Math.min(count,20)} high-quality exam-focused flashcards from this content.

CONTENT: ${content.slice(0,3000)}

Respond ONLY with a valid JSON array:
[
  { "question": "<specific question>", "answer": "<concise accurate answer>", "hint": "<memory hint>", "tags": ["<tag>"] }
]`;

    const text2  = await callClaude("You are an expert at creating educational flashcards.", [{ role:"user", content: prompt }], 2000);
    const cards  = parseJSON(text2);
    if (!Array.isArray(cards)) return res.status(500).json({ error: "AI failed to generate cards" });

    res.json({ cards, count: cards.length });
  } catch (err) { next(err); }
});

// GET /api/ai/study-guidance
router.get("/study-guidance", authenticate, async (req, res, next) => {
  try {
    const [weak, exams, due] = await Promise.all([
      db.many(
        `SELECT ms.score, st.name, t.name AS topic
         FROM memory_strength ms
         JOIN subtopics st ON st.id=ms.subtopic_id
         JOIN topics t ON t.id=st.topic_id
         WHERE ms.user_id=$1 ORDER BY ms.score LIMIT 8`,
        [req.user.id]
      ),
      db.many(
        `SELECT ea.total_score, pp.title FROM exam_attempts ea
         JOIN past_papers pp ON pp.id=ea.paper_id
         WHERE ea.user_id=$1 AND ea.submitted_at IS NOT NULL
         ORDER BY ea.submitted_at DESC LIMIT 5`,
        [req.user.id]
      ),
      db.one(
        "SELECT COUNT(*)::int AS count FROM flashcard_progress WHERE user_id=$1 AND next_review<=CURRENT_DATE",
        [req.user.id]
      ),
    ]);

    const prompt = `You are an academic strategist for a UK A-Level student.

Weak memory areas: ${JSON.stringify(weak.filter(w=>w.score<50))}
Recent exam scores: ${JSON.stringify(exams)}
Flashcards due today: ${due.count}

Give a personalised study plan. Respond ONLY with valid JSON:
{
  "todayFocus": "<main priority>",
  "recommendations": [{ "action": "<action>", "reason": "<why>", "priority": <1-5> }],
  "encouragement": "<one motivational sentence>",
  "estimatedTime": "<e.g. 45 minutes>"
}`;

    const text   = await callClaude("You are a personal academic coach.", [{ role:"user", content: prompt }], 600);
    const result = parseJSON(text) || { todayFocus: text };
    res.json(result);
  } catch (err) { next(err); }
});

async function upsertMemoryStrength(userId, subtopicId, field, value) {
  await db.query(
    `INSERT INTO memory_strength (user_id, subtopic_id, ${field})
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, subtopic_id) DO UPDATE
     SET ${field}=$3,
         score=(memory_strength.flashcard_score + memory_strength.recall_score + memory_strength.blurt_score + memory_strength.exam_score) / 4,
         updated_at=NOW()`,
    [userId, subtopicId, value]
  );
}

module.exports = router;
