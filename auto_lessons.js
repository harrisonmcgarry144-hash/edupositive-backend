const Anthropic = require("@anthropic-ai/sdk");
const db = require('./index');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude(system, messages, maxTokens = 4000) {
  const res = await client.messages.create({
    model: "claude-opus-4-5", max_tokens: maxTokens, system, messages,
  });
  return res.content[0].text;
}

function parseJSON(text) {
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) try { return JSON.parse(match[0]); } catch {}
    return null;
  }
}

// Write a single lesson for a subtopic based on style examples
async function writeLessonForSubtopic(subtopic, subject, styleExamples, adminId) {
  const styleGuide = styleExamples.slice(0, 6).map((e, i) =>
    `EXAMPLE ${i+1} (${e.subject} — ${e.subtopic}):\nTitle: ${e.title}\n${e.content.slice(0, 800)}`
  ).join("\n\n---\n\n");

  const prompt = `You are writing an A-Level revision lesson for ${subject.name}.

SUBTOPIC: ${subtopic.name}
TOPIC: ${subtopic.topic}
SUBJECT: ${subject.name}

Study these example lessons carefully and match their exact style, depth and structure:

${styleGuide}

Write a complete lesson for "${subtopic.name}" following the EXACT same style as the examples.

Rules:
- Match the tone, depth and paragraph structure exactly
- Never use em dashes (--)
- No generic AI phrases like "It is important to note", "Furthermore", "In conclusion"
- No bullet point lists unless examples use them
- Write as a knowledgeable teacher would naturally write
- Include relevant key terms, equations or concepts
- Length should match the examples

Return ONLY valid JSON:
{
  "title": "<lesson title>",
  "summary": "<one sentence summary>",
  "content": "<full lesson content>"
}`;

  const text = await callClaude(
    "You are an expert A-Level teacher. Match the style of the examples exactly. Never use em dashes.",
    [{ role: "user", content: prompt }],
    3000
  );

  return parseJSON(text);
}

// Auto-complete a single subject using given style examples
async function autoCompleteSubject(subjectId, adminId, styleExamples) {
  // Get empty subtopics (no lessons yet)
  const emptySubtopics = await db.many(
    `SELECT st.id, st.name, t.name AS topic
     FROM subtopics st
     JOIN topics t ON t.id=st.topic_id
     WHERE t.subject_id=$1
     AND st.id NOT IN (
       SELECT DISTINCT subtopic_id FROM lessons WHERE is_published=true
     )`,
    [subjectId]
  );

  if (!emptySubtopics.length) {
    console.log(`[AutoLesson] No empty subtopics in subject ${subjectId}`);
    return 0;
  }

  const subject = await db.one("SELECT name FROM subjects WHERE id=$1", [subjectId]);
  console.log(`[AutoLesson] Writing ${emptySubtopics.length} lessons for ${subject.name}`);

  let written = 0;
  for (const subtopic of emptySubtopics) {
    try {
      const lesson = await writeLessonForSubtopic(subtopic, subject, styleExamples, adminId);
      if (!lesson?.title || !lesson?.content) continue;

      const row = await db.one(
        `INSERT INTO lessons (subtopic_id, title, summary, content, is_published, created_by, updated_by)
         VALUES ($1,$2,$3,$4,true,$5,$5) RETURNING id`,
        [subtopic.id, lesson.title, lesson.summary || "", lesson.content, adminId]
      );

      // Auto-generate flashcards and questions in background
      try {
        const { autoGenerateFlashcards } = require('./auto_lessons');
        await autoGenerateFlashcards(subtopic.id, lesson.content, adminId);
      } catch(e) {}

      try {
        const { generateLessonQuestions } = require('./auto_questions');
        generateLessonQuestions(row.id).catch(() => {});
      } catch(e) {}

      written++;
      console.log(`[AutoLesson] Written: ${lesson.title}`);
      await new Promise(r => setTimeout(r, 1500)); // Rate limit delay
    } catch(e) {
      console.error(`[AutoLesson] Failed for ${subtopic.name}:`, e.message);
    }
  }

  // Mark this subject as auto-completed
  await db.query(
    "INSERT INTO auto_complete_log (subject_id, lessons_written, completed_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
    [subjectId, written, adminId]
  );

  return written;
}

// Main trigger — called after every lesson upload
async function checkAndAutoComplete(subjectId, adminId) {
  try {
    // Check if this subject was already auto-completed
    const alreadyDone = await db.one(
      "SELECT id FROM auto_complete_log WHERE subject_id=$1",
      [subjectId]
    ).catch(() => null);
    if (alreadyDone) return;

    // Count lessons in this subject
    const countRow = await db.one(
      `SELECT COUNT(l.id)::int AS count
       FROM lessons l
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       WHERE t.subject_id=$1 AND l.is_published=true`,
      [subjectId]
    );

    // Phase 1: When a subject hits 3 lessons, auto-complete just that subject
    if (countRow.count === 3) {
      console.log(`[AutoLesson] Subject ${subjectId} hit 3 lessons — auto-completing...`);

      // Get style examples from THIS subject only
      const examples = await db.many(
        `SELECT l.title, l.content, l.summary, st.name AS subtopic, t.name AS topic, s.name AS subject
         FROM lessons l
         JOIN subtopics st ON st.id=l.subtopic_id
         JOIN topics t ON t.id=st.topic_id
         JOIN subjects s ON s.id=t.subject_id
         WHERE t.subject_id=$1 AND l.is_published=true
         ORDER BY l.created_at LIMIT 3`,
        [subjectId]
      );

      await autoCompleteSubject(subjectId, adminId, examples);

      // Phase 2: Check if 7 subjects are now fully auto-completed
      const completedCount = await db.one(
        "SELECT COUNT(*)::int AS count FROM auto_complete_log",
        []
      );

      if (completedCount.count >= 7) {
        console.log(`[AutoLesson] 7 subjects complete! Starting full platform auto-fill...`);
        await triggerFullPlatformFill(adminId);
      }
    }

  } catch(e) {
    console.error("[AutoLesson] Error:", e.message);
  }
}

// Phase 2: After 7 subjects done, fill ALL remaining subjects
async function triggerFullPlatformFill(adminId) {
  try {
    // Check if full fill already happened
    const alreadyFilled = await db.one(
      "SELECT id FROM auto_complete_log WHERE subject_id='full_platform'",
      []
    ).catch(() => null);
    if (alreadyFilled) return;

    // Mark it as started to prevent double-running
    await db.query(
      "INSERT INTO auto_complete_log (subject_id, lessons_written, completed_by) VALUES ('full_platform',0,$1)",
      [adminId]
    );

    // Get all completed subjects and their lessons as style examples
    const completedSubjectIds = await db.many(
      "SELECT subject_id FROM auto_complete_log WHERE subject_id != 'full_platform'",
      []
    );
    const ids = completedSubjectIds.map(r => r.subject_id);

    // Get up to 15 example lessons spread across all 7 subjects
    const styleExamples = await db.many(
      `SELECT l.title, l.content, l.summary, st.name AS subtopic, t.name AS topic, s.name AS subject
       FROM lessons l
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       JOIN subjects s ON s.id=t.subject_id
       WHERE t.subject_id = ANY($1) AND l.is_published=true
       ORDER BY l.created_at
       LIMIT 15`,
      [ids]
    );

    console.log(`[AutoLesson] Full platform fill: ${styleExamples.length} style examples loaded`);

    // Find all subjects that haven't been auto-completed yet
    const remainingSubjects = await db.many(
      `SELECT id, name FROM subjects
       WHERE id NOT IN (
         SELECT subject_id::uuid FROM auto_complete_log
         WHERE subject_id != 'full_platform'
       )`,
      []
    );

    console.log(`[AutoLesson] ${remainingSubjects.length} subjects to fill`);

    for (const subject of remainingSubjects) {
      console.log(`[AutoLesson] Auto-filling: ${subject.name}`);
      await autoCompleteSubject(subject.id, adminId, styleExamples);
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log("[AutoLesson] Full platform fill complete!");

  } catch(e) {
    console.error("[AutoLesson] Full platform fill error:", e.message);
  }
}

// Auto-generate flashcards for a subtopic
async function autoGenerateFlashcards(subtopicId, lessonContent, adminId) {
  try {
    const existing = await db.one(
      `SELECT COUNT(f.id)::int AS count FROM flashcards f
       JOIN flashcard_decks fd ON fd.id=f.deck_id WHERE fd.subtopic_id=$1`,
      [subtopicId]
    ).catch(() => ({ count: 0 }));
    if (existing.count > 0) return;

    const subtopic = await db.one(
      `SELECT st.name, t.name AS topic, s.name AS subject
       FROM subtopics st JOIN topics t ON t.id=st.topic_id JOIN subjects s ON s.id=t.subject_id
       WHERE st.id=$1`,
      [subtopicId]
    );

    const prompt = `Create 8 A-Level exam flashcards for this topic.

SUBJECT: ${subtopic.subject} — ${subtopic.topic} — ${subtopic.name}
CONTENT: ${lessonContent.slice(0, 2500)}

Return ONLY a JSON array:
[{ "question": "...", "answer": "...", "hint": "..." }]`;

    const text = await callClaude(
      "You are an A-Level examiner creating concise revision flashcards.",
      [{ role: "user", content: prompt }], 2000
    );

    let cards;
    try {
      cards = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch(e) {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) cards = JSON.parse(match[0]);
      else return;
    }

    if (!Array.isArray(cards) || !cards.length) return;

    const subjectIdRow = await db.one(
      "SELECT subject_id FROM topics t JOIN subtopics st ON st.topic_id=t.id WHERE st.id=$1",
      [subtopicId]
    );

    const deck = await db.one(
      `INSERT INTO flashcard_decks (user_id, title, subject_id)
       VALUES ($1,$2,$3) RETURNING id`,
      [adminId, `${subtopic.name} — ${subtopic.subject}`, subjectIdRow.subject_id]
    );

    for (const card of cards) {
      if (!card.question || !card.answer) continue;
      await db.query(
        "INSERT INTO flashcards (deck_id, question, answer, hint) VALUES ($1,$2,$3,$4)",
        [deck.id, card.question, card.answer, card.hint || null]
      );
    }

    console.log(`[AutoFlashcard] ${cards.length} cards for ${subtopic.name}`);
  } catch(e) {
    console.error("[AutoFlashcard] Error:", e.message);
  }
}

module.exports = { checkAndAutoComplete, autoGenerateFlashcards, triggerFullPlatformFill };
