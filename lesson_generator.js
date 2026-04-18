const { callAI } = require('./groq_client');
const db = require('./index');

const SYSTEM_PROMPT = `You are an experienced A-Level teacher writing revision notes for students.

CRITICAL WRITING RULES:
- Write like a real teacher talking to a student, not like an AI assistant
- Vary your sentence lengths dramatically. Short punchy sentences. Then longer ones that build on a point and add context. Then short again.
- Use specific, concrete examples and real numbers, not vague generalities
- Be direct and confident. Never hedge with phrases like "it's worth noting", "it's important to consider", "generally speaking", "to some extent"
- Never use em dashes. Use commas, full stops, or colons instead
- Never write in bullet points or numbered lists. Everything is prose paragraphs
- Never use these words: delve, leverage, underscore, tapestry, realm, game-changer, nuanced, multifaceted, holistic, synergy, paradigm, testament, pivotal
- Do not use passive voice where you can avoid it
- Write with a direct, slightly informal but knowledgeable tone, like a teacher who genuinely finds the subject interesting
- Specific real-world examples make concepts stick. Use them
- No unnecessary repetition of points already made
- No bullet points under any circumstances`;

async function generateLesson(subtopicId, examBoard) {
  const subtopic = await db.one(
    `SELECT st.name AS subtopic, t.name AS topic, s.name AS subject
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     JOIN subjects s ON s.id = t.subject_id
     WHERE st.id = $1`,
    [subtopicId]
  );

  const { subject, topic, subtopic: subtopicName } = subtopic;

  const prompt = `Write a complete A-Level revision lesson on "${subtopicName}" for ${examBoard} ${subject} (topic: ${topic}).

The lesson should cover everything a student needs to know for their ${examBoard} A-Level exam on this specific subtopic.

Structure the lesson with these sections (use ## for headers):
## Introduction
## Core Concepts
## Key Details
## Worked Examples
## Common Exam Mistakes
## Summary

Each section should be 2-4 substantial paragraphs of flowing prose. Be specific to the ${examBoard} specification. Include real examples, specific facts, and the kind of insight that separates an A* student from a B student. Do not use bullet points or lists at all.`;

  return await callAI(SYSTEM_PROMPT, prompt, 2000);
}

async function generateLessonsForSubject(subjectId, examBoard, onProgress) {
  const subtopics = await db.many(
    `SELECT st.id, st.name AS subtopic, t.name AS topic
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     WHERE t.subject_id = $1
     ORDER BY t.order_index, st.order_index`,
    [subjectId]
  );

  let completed = 0;
  const total = subtopics.length;

  for (const sub of subtopics) {
    const existing = await db.one(
      `SELECT COUNT(*)::int AS count FROM lessons WHERE subtopic_id=$1 AND exam_board=$2`,
      [sub.id, examBoard]
    );

    if (existing.count === 0) {
      try {
        const content = await generateLesson(sub.id, examBoard);
        await db.query(
          `INSERT INTO lessons (subtopic_id, title, content, exam_board, is_ai_generated)
           VALUES ($1, $2, $3, $4, true)`,
          [sub.id, sub.subtopic, content, examBoard]
        );
      } catch (e) {
        console.error(`Failed to generate lesson for ${sub.subtopic}:`, e.message);
      }
    }

    completed++;
    if (onProgress) onProgress(completed, total);
    await new Promise(r => setTimeout(r, 200));
  }

  return { completed, total };
}

async function isSubjectGenerated(subjectId, examBoard) {
  const result = await db.one(
    `SELECT COUNT(DISTINCT st.id)::int AS total_subtopics,
            COUNT(DISTINCT l.subtopic_id)::int AS generated_lessons
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     LEFT JOIN lessons l ON l.subtopic_id = st.id AND l.exam_board = $2
     WHERE t.subject_id = $1`,
    [subjectId, examBoard]
  );
  return result.total_subtopics > 0 && result.generated_lessons >= result.total_subtopics;
}

async function getGenerationProgress(subjectId, examBoard) {
  const result = await db.one(
    `SELECT COUNT(DISTINCT st.id)::int AS total,
            COUNT(DISTINCT l.subtopic_id)::int AS done
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     LEFT JOIN lessons l ON l.subtopic_id = st.id AND l.exam_board = $2
     WHERE t.subject_id = $1`,
    [subjectId, examBoard]
  );
  return { total: result.total, done: result.done };
}

module.exports = { generateLessonsForSubject, isSubjectGenerated, getGenerationProgress };
