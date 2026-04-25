const { callAI } = require('./gemini_client');
const db = require('./index');

const SYSTEM_PROMPT = `You are an experienced A-Level teacher writing short, focused revision lessons for students.

CRITICAL WRITING RULES:
- Write like a real teacher, not an AI. Keep it direct, confident, specific.
- Vary sentence lengths dramatically. Short. Then longer, more detailed sentences. Then short again.
- Use specific examples with real numbers and real scenarios
- Never use: em dashes, bullet points, numbered lists, "delve", "leverage", "underscore", "tapestry", "realm", "nuanced", "multifaceted", "it's worth noting", "generally speaking", "in today's world"
- Never hedge. Be direct.
- Write in flowing prose paragraphs, never lists
- Each paragraph should be 2-4 sentences maximum. Keep it digestible.`;

// Retry with aggressive backoff only on actual 429s
async function callAIWithRetry(system, prompt, maxTokens, retries = 5) {
  let delay = 10000;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await callAI(system, prompt, maxTokens);
    } catch (e) {
      const is429 = e.message?.includes('429') || e.status === 429;
      if (is429) {
        console.log(`[LessonGen] Rate limited. Waiting ${delay/1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 60000);
      } else if (attempt === retries - 1) {
        throw e;
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw new Error('Max retries exceeded');
}

async function planLessons(subjectName, topicName, subtopicName, examBoard) {
  const prompt = `Plan the mini-lessons for an A-Level ${subjectName} subtopic: "${subtopicName}" (within topic "${topicName}"). Exam board: ${examBoard}.

Return EXACTLY a JSON array of 4-6 lesson titles that progressively build understanding. Final lesson should be a summary.

Return ONLY the JSON array, no other text.`;

  const text = await callAIWithRetry(SYSTEM_PROMPT, prompt, 300);
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch(e) {}
  return [subtopicName];
}

async function generateMiniLesson(subjectName, topicName, subtopicName, lessonTitle, examBoard, lessonIndex, totalLessons) {
  const isSummary = lessonIndex === totalLessons - 1;
  const prompt = `Write a short focused A-Level revision lesson titled "${lessonTitle}".

Context: Lesson ${lessonIndex + 1} of ${totalLessons} for subtopic "${subtopicName}" in ${subjectName} (${examBoard}, topic: ${topicName}).
${isSummary ? "This is the FINAL lesson - synthesis of everything." : "Focus narrowly on ONE specific aspect."}

Structure with these ## sections:
## Introduction
## Core Concepts
## Key Details
${isSummary ? "## Summary" : "## Worked Examples\n## Summary"}

Each section: 1-2 SHORT paragraphs. Total around 4-5 paragraphs max. Specific, concrete, exam-focused.`;

  return await callAIWithRetry(SYSTEM_PROMPT, prompt, 900);
}

async function generateLessonsForSubtopic(subtopicId, examBoard) {
  const sub = await db.one(
    `SELECT st.id, st.name AS subtopic, t.name AS topic, s.name AS subject
     FROM subtopics st JOIN topics t ON t.id = st.topic_id JOIN subjects s ON s.id = t.subject_id
     WHERE st.id = $1`,
    [subtopicId]
  );

  // PERMANENT: never overwrite existing lessons
  const existing = await db.one(
    `SELECT COUNT(*)::int AS count FROM lessons WHERE subtopic_id=$1 AND exam_board=$2`,
    [subtopicId, examBoard]
  );
  if (existing.count > 0) return { skipped: true };

  try {
    const titles = await planLessons(sub.subject, sub.topic, sub.subtopic, examBoard);

    // Generate lessons sequentially to stay within Gemini rate limits
    const results = [];
    for (let i = 0; i < titles.length; i++) {
      try {
        const content = await generateMiniLesson(sub.subject, sub.topic, sub.subtopic, titles[i], examBoard, i, titles.length);
        results.push({ title: titles[i], content, i });
      } catch (err) {
        console.error(`[LessonGen] Failed lesson "${titles[i]}":`, err.message);
        results.push(null);
      }
      if (i < titles.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    // Insert all lessons
    for (const r of results) {
      if (!r || !r.content) continue;
      await db.query(
        `INSERT INTO lessons (subtopic_id, title, content, exam_board, is_ai_generated, is_published)
         VALUES ($1, $2, $3, $4, true, true)`,
        [subtopicId, r.title, r.content, examBoard]
      );
    }

    return { total: results.filter(Boolean).length };
  } catch(e) {
    console.error(`[LessonGen] Failed subtopic "${sub.subtopic}":`, e.message);
    return { error: e.message };
  }
}

async function getGenerationProgress(subjectId, board) {
  const totalRow = await db.one(
    `SELECT COUNT(st.id)::int AS count
     FROM subtopics st JOIN topics t ON t.id = st.topic_id
     WHERE t.subject_id = $1`,
    [subjectId]
  );
  const doneRow = await db.one(
    `SELECT COUNT(DISTINCT l.subtopic_id)::int AS count
     FROM lessons l
     JOIN subtopics st ON st.id = l.subtopic_id
     JOIN topics t ON t.id = st.topic_id
     WHERE t.subject_id = $1 AND l.exam_board = $2 AND l.is_published = true`,
    [subjectId, board]
  );
  return { done: doneRow.count, total: totalRow.count };
}

async function generateLessonsForSubject(subjectId, board, progressCallback) {
  const subtopics = await db.manyOrNone(
    `SELECT st.id FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     WHERE t.subject_id = $1`,
    [subjectId]
  );

  const total = subtopics.length;
  let done = 0;

  for (const sub of subtopics) {
    await generateLessonsForSubtopic(sub.id, board);
    done++;
    if (progressCallback) progressCallback(done, total);
  }
}

module.exports = { generateLessonsForSubtopic, generateLessonsForSubject, getGenerationProgress };
