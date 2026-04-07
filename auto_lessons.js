const Anthropic = require("@anthropic-ai/sdk");
const db = require('./index');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude(system, messages, maxTokens = 4000) {
  const res = await client.messages.create({
    model: "claude-opus-4-5", max_tokens: maxTokens, system, messages,
  });
  return res.content[0].text;
}

// Called when a new lesson is saved — checks if we should auto-complete the subject
async function checkAndAutoComplete(subjectId, adminId) {
  try {
    // Count published lessons in this subject
    const countRow = await db.one(
      `SELECT COUNT(l.id)::int AS count
       FROM lessons l
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       WHERE t.subject_id=$1 AND l.is_published=true`,
      [subjectId]
    );

    if (countRow.count < 3) return; // Not enough lessons yet
    if (countRow.count > 3) return; // Already auto-completed before

    console.log(`[AutoLesson] Triggering auto-complete for subject ${subjectId}`);

    // Get the 3 existing lessons as style examples
    const examples = await db.many(
      `SELECT l.title, l.content, l.summary, st.name AS subtopic, t.name AS topic
       FROM lessons l
       JOIN subtopics st ON st.id=l.subtopic_id
       JOIN topics t ON t.id=st.topic_id
       WHERE t.subject_id=$1 AND l.is_published=true
       ORDER BY l.created_at
       LIMIT 3`,
      [subjectId]
    );

    const subject = await db.one("SELECT name FROM subjects WHERE id=$1", [subjectId]);

    // Get all subtopics that have NO lessons yet
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

    if (!emptySubtopics.length) return;

    console.log(`[AutoLesson] Writing ${emptySubtopics.length} lessons for ${subject.name}`);

    // Build style guide from examples
    const styleGuide = examples.map((e, i) =>
      `EXAMPLE ${i+1} - ${e.subtopic} (${e.topic}):\nTitle: ${e.title}\nContent:\n${e.content}`
    ).join("\n\n========\n\n");

    // Process in batches of 5 to avoid timeout
    for (let i = 0; i < emptySubtopics.length; i += 5) {
      const batch = emptySubtopics.slice(i, i + 5);

      for (const subtopic of batch) {
        try {
          const prompt = `You are writing an A-Level revision lesson for ${subject.name}.

SUBTOPIC: ${subtopic.name}
TOPIC: ${subtopic.topic}

Study these 3 example lessons carefully and match their exact style, depth, and structure:

${styleGuide}

Now write a lesson for "${subtopic.name}" following the EXACT same style as the examples above.

Rules:
- Match the tone, depth and paragraph structure of the examples exactly
- No em dashes (never use --)
- No bullet point lists unless the examples use them
- No headers like "Introduction:" or "Conclusion:" unless examples use them
- No AI-sounding phrases like "It is important to note that" or "Furthermore" or "In conclusion"
- Write naturally as an expert teacher would
- Include key terms, equations or diagrams described in text where relevant
- Length should match the examples

Return ONLY valid JSON:
{
  "title": "<lesson title>",
  "summary": "<one sentence summary>",
  "content": "<full lesson content>"
}`;

          const text = await callClaude(
            "You are an expert A-Level teacher writing revision notes. Match the style of the examples exactly.",
            [{ role: "user", content: prompt }],
            3000
          );

          let parsed;
          try {
            parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
          } catch(e) {
            // Try to extract JSON from the response
            const match = text.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
            else continue;
          }

          if (!parsed?.title || !parsed?.content) continue;

          await db.query(
            `INSERT INTO lessons (subtopic_id, title, summary, content, is_published, created_by, updated_by)
             VALUES ($1,$2,$3,$4,true,$5,$5)`,
            [subtopic.id, parsed.title, parsed.summary || "", parsed.content, adminId]
          );

          // Auto-generate flashcards for this lesson
          await autoGenerateFlashcards(subtopic.id, parsed.content, adminId);

          console.log(`[AutoLesson] Written: ${parsed.title}`);

          // Small delay to avoid rate limits
          await new Promise(r => setTimeout(r, 1000));

        } catch(e) {
          console.error(`[AutoLesson] Failed for ${subtopic.name}:`, e.message);
        }
      }
    }

    console.log(`[AutoLesson] Complete for ${subject.name}`);

  } catch(e) {
    console.error("[AutoLesson] Error:", e.message);
  }
}

// Auto-generate flashcards for a subtopic based on lesson content
async function autoGenerateFlashcards(subtopicId, lessonContent, adminId) {
  try {
    // Check if flashcards already exist for this subtopic
    const existing = await db.one(
      `SELECT COUNT(f.id)::int AS count
       FROM flashcards f
       JOIN flashcard_decks fd ON fd.id=f.deck_id
       WHERE fd.subtopic_id=$1`,
      [subtopicId]
    );
    if (existing.count > 0) return;

    const subtopic = await db.one(
      `SELECT st.name, t.name AS topic, s.name AS subject
       FROM subtopics st
       JOIN topics t ON t.id=st.topic_id
       JOIN subjects s ON s.id=t.subject_id
       WHERE st.id=$1`,
      [subtopicId]
    );

    const prompt = `Create 8 high-quality A-Level exam flashcards for this topic.

SUBJECT: ${subtopic.subject}
TOPIC: ${subtopic.topic}
SUBTOPIC: ${subtopic.name}
LESSON CONTENT: ${lessonContent.slice(0, 3000)}

Rules:
- Questions should be exam-style (define, explain, state, calculate, evaluate)
- Answers should be concise but complete enough for exam marks
- Include key terms, processes, and concepts
- No filler questions

Return ONLY a JSON array:
[
  { "question": "...", "answer": "...", "hint": "..." }
]`;

    const text = await callClaude(
      "You are an A-Level examiner creating revision flashcards.",
      [{ role: "user", content: prompt }],
      2000
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

    // Create a deck for this subtopic
    const deck = await db.one(
      `INSERT INTO flashcard_decks (user_id, title, subject_id, subtopic_id, is_auto_generated)
       VALUES ($1,$2,(SELECT subject_id FROM topics t JOIN subtopics st ON st.topic_id=t.id WHERE st.id=$3),$3,true)
       RETURNING id`,
      [adminId, `${subtopic.name} — ${subtopic.subject}`, subtopicId]
    ).catch(async () => {
      // Try without subtopic_id if column doesn't exist
      return db.one(
        `INSERT INTO flashcard_decks (user_id, title, subject_id)
         VALUES ($1,$2,(SELECT subject_id FROM topics t JOIN subtopics st ON st.topic_id=t.id WHERE st.id=$3))
         RETURNING id`,
        [adminId, `${subtopic.name} — ${subtopic.subject}`, subtopicId]
      );
    });

    for (const card of cards) {
      if (!card.question || !card.answer) continue;
      await db.query(
        "INSERT INTO flashcards (deck_id, question, answer, hint) VALUES ($1,$2,$3,$4)",
        [deck.id, card.question, card.answer, card.hint || null]
      );
    }

    console.log(`[AutoFlashcard] Generated ${cards.length} cards for ${subtopic.name}`);

  } catch(e) {
    console.error("[AutoFlashcard] Error:", e.message);
  }
}

module.exports = { checkAndAutoComplete, autoGenerateFlashcards };
