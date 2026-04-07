const Anthropic = require("@anthropic-ai/sdk");
const db = require('./index');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude(system, messages, maxTokens = 3000) {
  const res = await client.messages.create({
    model: "claude-opus-4-5", max_tokens: maxTokens, system, messages,
  });
  return res.content[0].text;
}

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) try { return JSON.parse(match[0]); } catch {}
    return null;
  }
}

async function generateLessonQuestions(lessonId) {
  try {
    // Check if questions already exist for this lesson
    const existing = await db.one(
      "SELECT COUNT(*)::int AS count FROM lesson_questions WHERE lesson_id=$1",
      [lessonId]
    );
    if (existing.count > 0) return;

    // Get lesson content and subject info
    const lesson = await db.one(
      `SELECT l.*, st.name AS subtopic, t.name AS topic, s.name AS subject, s.id AS subject_id,
              s.description AS board_info
       FROM lessons l
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       JOIN subjects s ON s.id=t.subject_id
       WHERE l.id=$1`,
      [lessonId]
    );
    if (!lesson) return;

    console.log(`[AutoQuestions] Generating questions for: ${lesson.title}`);

    const prompt = `You are an expert A-Level examiner for ${lesson.subject} creating exam practice questions.

LESSON TITLE: ${lesson.title}
SUBJECT: ${lesson.subject}
TOPIC: ${lesson.topic}
SUBTOPIC: ${lesson.subtopic}

LESSON CONTENT:
${lesson.content.slice(0, 3000)}

Create 6 exam questions that progress from Grade C to Grade A* difficulty. Base the style and format on real A-Level exam questions and mark schemes for this subject.

Grade progression:
- 2 questions at Grade C level (straightforward recall/basic application, 2-4 marks)
- 2 questions at Grade B/A level (application and analysis, 4-6 marks)
- 2 questions at Grade A* level (evaluation, synoptic, extended writing, 6-9 marks)

Rules:
- Use proper exam command words (state, explain, describe, evaluate, assess, calculate, discuss)
- Mark allocations should match the difficulty
- Mark schemes should use proper examiner language with credit points
- Model answers should be at the top of the grade band
- No generic questions — everything must be specific to the lesson content

Return ONLY a valid JSON array:
[
  {
    "question": "<full exam question text>",
    "marks": <number>,
    "grade": "<C|B|A|A*>",
    "command_word": "<state|explain|describe|evaluate|etc>",
    "mark_scheme": "<mark scheme with bullet points of creditworthy points, e.g. 1 mark each>",
    "model_answer": "<full model answer at top of grade band>",
    "examiner_tip": "<one sentence tip for this type of question>"
  }
]`;

    const text = await callClaude(
      "You are a senior A-Level examiner. Write questions exactly as they would appear in a real exam paper.",
      [{ role: "user", content: prompt }],
      3000
    );

    const questions = parseJSON(text);
    if (!Array.isArray(questions) || !questions.length) {
      console.error("[AutoQuestions] Failed to parse questions");
      return;
    }

    // Save questions to database
    for (const q of questions) {
      if (!q.question || !q.marks) continue;
      await db.query(
        `INSERT INTO lesson_questions 
         (lesson_id, question, marks, grade, command_word, mark_scheme, model_answer, examiner_tip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          lessonId,
          q.question,
          q.marks,
          q.grade || "B",
          q.command_word || null,
          q.mark_scheme || null,
          q.model_answer || null,
          q.examiner_tip || null,
        ]
      );
    }

    console.log(`[AutoQuestions] Generated ${questions.length} questions for "${lesson.title}"`);

  } catch(e) {
    console.error("[AutoQuestions] Error:", e.message);
  }
}

module.exports = { generateLessonQuestions };
