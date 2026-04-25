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

// Proactive rate limiter: stay under Gemini free tier (15 RPM)
const RPM_LIMIT = 12;
let _requestTimestamps = [];
async function waitForRateLimit() {
  const now = Date.now();
  _requestTimestamps = _requestTimestamps.filter(t => now - t < 60000);
  if (_requestTimestamps.length >= RPM_LIMIT) {
    const wait = 60000 - (now - _requestTimestamps[0]) + 500;
    console.log(`[LessonGen] Pacing — waiting ${Math.round(wait / 1000)}s to stay under ${RPM_LIMIT} RPM`);
    await new Promise(r => setTimeout(r, wait));
    return waitForRateLimit();
  }
  _requestTimestamps.push(Date.now());
}

async function callAIWithRetry(system, prompt, maxTokens, retries = 2) {
  await waitForRateLimit();
  let delay = 60000;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await callAI(system, prompt, maxTokens);
    } catch (e) {
      const is429 = e.message?.includes('429') || e.status === 429;
      if (is429) {
        if (attempt === retries - 1) {
          // Don't keep burning quota — surface a quota error so caller can stop for the day
          throw new Error('QUOTA_EXHAUSTED');
        }
        console.log(`[LessonGen] 429 received. Waiting ${delay / 1000}s (attempt ${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 120000);
        await waitForRateLimit();
      } else if (attempt === retries - 1) {
        throw e;
      } else {
        await new Promise(r => setTimeout(r, 3000));
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
    `SELECT COUNT(*)::int AS count FROM lessons WHERE subtopic_id=$1 AND exam_board=$2 AND is_published=true`,
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
        if (err.message === 'QUOTA_EXHAUSTED') throw err; // propagate — don't waste more retries
        console.error(`[LessonGen] Failed lesson "${titles[i]}":`, err.message);
        results.push(null);
      }
      // pacing handled by waitForRateLimit inside callAIWithRetry
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
    const res = await generateLessonsForSubtopic(sub.id, board);
    if (res.error) {
      console.error(`[LessonGen] Error for subtopic ${sub.id}:`, res.error);
    } else if (res.skipped) {
      // already exists
    } else {
      console.log(`[LessonGen] Generated ${res.total} lessons for subtopic ${sub.id}`);
    }
    done++;
    if (progressCallback) progressCallback(done, total);
  }
}

module.exports = { generateLessonsForSubtopic, generateLessonsForSubject, getGenerationProgress };
