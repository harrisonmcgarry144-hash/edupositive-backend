const { callAI } = require('./groq_client');
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

// Step 1: AI plans the lessons for this subtopic
async function planLessons(subjectName, topicName, subtopicName, examBoard) {
  const prompt = `Plan the mini-lessons for an A-Level ${subjectName} subtopic: "${subtopicName}" (within topic "${topicName}"). Exam board: ${examBoard}.

Return EXACTLY a JSON array of 4-7 lesson titles that progressively build understanding. Each lesson should cover ONE specific aspect in depth. The final lesson should be a synthesis/summary.

Example for "Water" in Biology:
[
  "The Polarity of Water",
  "Hydrogen Bonding in Water",
  "Water as a Solvent",
  "The Thermal Properties of Water",
  "Water's Role in Living Organisms",
  "Summary: Why Water is Essential for Life"
]

Return ONLY the JSON array, no other text. Make each title specific and narrow in scope.`;

  const text = await callAI(SYSTEM_PROMPT, prompt, 500);
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
  } catch(e) {}
  return [subtopicName]; // fallback
}

// Step 2: Generate one specific mini-lesson
async function generateMiniLesson(subjectName, topicName, subtopicName, lessonTitle, examBoard, lessonIndex, totalLessons) {
  const isSummary = lessonIndex === totalLessons - 1;

  const prompt = `Write a short focused A-Level revision lesson titled "${lessonTitle}".

Context: This is lesson ${lessonIndex + 1} of ${totalLessons} for the subtopic "${subtopicName}" in ${subjectName} (${examBoard}, topic: ${topicName}).
${isSummary ? "This is the FINAL lesson - a synthesis that ties together everything from the previous lessons." : "This lesson focuses narrowly on ONE specific aspect of the subtopic."}

Structure the lesson with these sections using ## headers:
## Introduction
## Core Concepts
## Key Details
${isSummary ? "## Summary" : "## Worked Examples\n## Summary"}

Each section should be 1-2 SHORT paragraphs (2-4 sentences each). Total lesson must be around 5 paragraphs maximum. Be specific, concrete, and exam-focused. Use real examples and numbers.`;

  return await callAI(SYSTEM_PROMPT, prompt, 1500);
}

async function generateLessonsForSubtopic(subtopicId, examBoard, onProgress) {
  const sub = await db.one(
    `SELECT st.id, st.name AS subtopic, t.name AS topic, s.name AS subject
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     JOIN subjects s ON s.id = t.subject_id
     WHERE st.id = $1`,
    [subtopicId]
  );

  // Check if lessons already exist
  const existing = await db.many(
    `SELECT COUNT(*)::int AS count FROM lessons WHERE subtopic_id=$1 AND exam_board=$2`,
    [subtopicId, examBoard]
  );
  if (existing[0]?.count > 0) return { skipped: true };

  // Plan the lessons
  const titles = await planLessons(sub.subject, sub.topic, sub.subtopic, examBoard);

  // Generate each one
  for (let i = 0; i < titles.length; i++) {
    try {
      const content = await generateMiniLesson(sub.subject, sub.topic, sub.subtopic, titles[i], examBoard, i, titles.length);
      await db.query(
        `INSERT INTO lessons (subtopic_id, title, content, exam_board, is_ai_generated, is_published)
         VALUES ($1, $2, $3, $4, true, true)`,
        [subtopicId, titles[i], content, examBoard]
      );
      if (onProgress) onProgress(i + 1, titles.length);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.error(`Failed lesson for ${sub.subtopic} - ${titles[i]}:`, e.message);
    }
  }
  return { total: titles.length };
}

async function generateLessonsForSubject(subjectId, examBoard, onProgress) {
  const subtopics = await db.many(
    `SELECT st.id FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     WHERE t.subject_id = $1
     ORDER BY t.order_index, st.order_index`,
    [subjectId]
  );

  let completed = 0;
  for (const sub of subtopics) {
    await generateLessonsForSubtopic(sub.id, examBoard);
    completed++;
    if (onProgress) onProgress(completed, subtopics.length);
  }
  return { completed, total: subtopics.length };
}

async function getGenerationProgress(subjectId, examBoard) {
  const result = await db.one(
    `SELECT COUNT(DISTINCT st.id)::int AS total_subtopics,
            COUNT(DISTINCT st.id) FILTER (WHERE EXISTS (
              SELECT 1 FROM lessons l WHERE l.subtopic_id = st.id AND l.exam_board = $2
            ))::int AS done_subtopics
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     WHERE t.subject_id = $1`,
    [subjectId, examBoard]
  );
  return { total: result.total_subtopics, done: result.done_subtopics };
}

module.exports = { generateLessonsForSubject, generateLessonsForSubtopic, getGenerationProgress };
