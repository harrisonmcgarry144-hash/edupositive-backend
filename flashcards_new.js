const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const { hasPremium } = require('./payments');

const INTERVALS = [0, 1, 3, 7, 14, 28]; // days between reviews

function getNextInterval(currentInterval, rating) {
  const idx = INTERVALS.indexOf(currentInterval);
  if (rating >= 4) {
    const nextIdx = Math.min(idx + 1, INTERVALS.length - 1);
    return INTERVALS[nextIdx];
  } else if (rating === 3) {
    return 1;
  } else {
    return 0;
  }
}

function getNextReviewDate(intervalDays) {
  if (intervalDays === 0) return new Date().toISOString().slice(0, 10);
  const d = new Date();
  d.setDate(d.getDate() + intervalDays);
  return d.toISOString().slice(0, 10);
}

// GET /api/flashcards/decks — all user's decks
router.get("/decks", authenticate, async (req, res, next) => {
  try {
    const decks = await db.many(
      `SELECT fd.*,
        COUNT(f.id)::int AS total_cards,
        COUNT(fp.flashcard_id) FILTER (WHERE fp.interval_days >= 28)::int AS mastered,
        COUNT(fp.flashcard_id) FILTER (WHERE fp.next_review <= CURRENT_DATE AND fp.interval_days < 28)::int AS due_today,
        st.name AS subtopic_name, t.name AS topic_name, s.name AS subject_name
       FROM flashcard_decks fd
       LEFT JOIN flashcards f ON f.deck_id = fd.id
       LEFT JOIN flashcard_progress fp ON fp.flashcard_id = f.id AND fp.user_id = fd.user_id
       LEFT JOIN subtopics st ON st.id = fd.subtopic_id
       LEFT JOIN topics t ON t.id = st.topic_id
       LEFT JOIN subjects s ON s.id = t.subject_id
       WHERE fd.user_id = $1
       GROUP BY fd.id, st.name, t.name, s.name
       ORDER BY fd.created_at DESC`,
      [req.user.id]
    );
    res.json(decks);
  } catch (err) { next(err); }
});

// POST /api/flashcards/decks — create new deck
router.post("/decks", authenticate, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });

    const isPrem = await hasPremium(req.user.id);
    if (!isPrem) {
      const count = await db.one(
        "SELECT COUNT(*)::int AS count FROM flashcard_decks WHERE user_id=$1 AND is_auto_generated=false",
        [req.user.id]
      );
      if (count.count >= 3) {
        return res.status(403).json({ error: "Free accounts can only create 3 decks. Upgrade to Premium for unlimited decks." });
      }
    }

    const deck = await db.one(
      "INSERT INTO flashcard_decks (user_id, name, description) VALUES ($1,$2,$3) RETURNING *",
      [req.user.id, name.trim(), description || null]
    );
    res.status(201).json(deck);
  } catch (err) { next(err); }
});

// DELETE /api/flashcards/decks/:id
router.delete("/decks/:id", authenticate, async (req, res, next) => {
  try {
    await db.query("DELETE FROM flashcard_decks WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ message: "Deck deleted" });
  } catch (err) { next(err); }
});

// GET /api/flashcards/decks/:id/cards — get cards in deck
router.get("/decks/:id/cards", authenticate, async (req, res, next) => {
  try {
    const cards = await db.many(
      `SELECT f.*,
        fp.interval_days, fp.next_review, fp.repetitions, fp.last_reviewed,
        (fp.interval_days >= 28) AS is_mastered
       FROM flashcards f
       LEFT JOIN flashcard_progress fp ON fp.flashcard_id = f.id AND fp.user_id = $2
       WHERE f.deck_id = $1
       ORDER BY f.created_at`,
      [req.params.id, req.user.id]
    );
    res.json(cards);
  } catch (err) { next(err); }
});

// POST /api/flashcards/decks/:id/cards — add card to deck
router.post("/decks/:id/cards", authenticate, async (req, res, next) => {
  try {
    const { front, back } = req.body;
    if (!front?.trim() || !back?.trim()) return res.status(400).json({ error: "Front and back required" });

    const card = await db.one(
      "INSERT INTO flashcards (deck_id, user_id, front, back) VALUES ($1,$2,$3,$4) RETURNING *",
      [req.params.id, req.user.id, front.trim(), back.trim()]
    );

    await db.query(
      "INSERT INTO flashcard_progress (user_id, flashcard_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [req.user.id, card.id]
    );

    res.status(201).json(card);
  } catch (err) { next(err); }
});

// DELETE /api/flashcards/cards/:id
router.delete("/cards/:id", authenticate, async (req, res, next) => {
  try {
    await db.query("DELETE FROM flashcards WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
    res.json({ message: "Card deleted" });
  } catch (err) { next(err); }
});

// GET /api/flashcards/session/:deckId — get cards due for review
router.get("/session/:deckId", authenticate, async (req, res, next) => {
  try {
    const due = await db.many(
      `SELECT f.*, fp.interval_days, fp.next_review, fp.repetitions,
        (fp.interval_days >= 28) AS is_mastered
       FROM flashcards f
       JOIN flashcard_progress fp ON fp.flashcard_id = f.id AND fp.user_id = $2
       WHERE f.deck_id = $1
         AND fp.next_review <= CURRENT_DATE
         AND fp.interval_days < 28
       ORDER BY fp.next_review ASC, RANDOM()`,
      [req.params.deckId, req.user.id]
    );
    res.json(due);
  } catch (err) { next(err); }
});

// POST /api/flashcards/rate — rate a card
router.post("/rate", authenticate, async (req, res, next) => {
  try {
    const { cardId, rating } = req.body;
    if (!cardId || !rating || rating < 1 || rating > 5) return res.status(400).json({ error: "cardId and rating (1-5) required" });

    const current = await db.one(
      "SELECT * FROM flashcard_progress WHERE flashcard_id=$1 AND user_id=$2",
      [cardId, req.user.id]
    ).catch(() => null);

    const currentInterval = current?.interval_days || 0;
    const newInterval = getNextInterval(currentInterval, rating);
    const nextReview = getNextReviewDate(newInterval);
    const isMastered = newInterval >= 28 && (current?.repetitions || 0) >= 3;

    const correctDelta = rating >= 3 ? 1 : 0;
    const incorrectDelta = rating < 3 ? 1 : 0;

    await db.query(
      `INSERT INTO flashcard_progress (user_id, flashcard_id, interval_days, next_review, repetitions, correct_count, incorrect_count, last_reviewed)
       VALUES ($1,$2,$3,$4,1,$5,$6,NOW())
       ON CONFLICT (user_id, flashcard_id) DO UPDATE SET
         interval_days=$3, next_review=$4,
         repetitions=flashcard_progress.repetitions+1,
         correct_count=flashcard_progress.correct_count+$5,
         incorrect_count=flashcard_progress.incorrect_count+$6,
         last_reviewed=NOW()`,
      [req.user.id, cardId, newInterval, nextReview, correctDelta, incorrectDelta]
    );

    res.json({ newInterval, nextReview, isMastered, rating });
  } catch (err) { next(err); }
});

// GET /api/flashcards/due — all due cards across all decks
router.get("/due", authenticate, async (req, res, next) => {
  try {
    const due = await db.one(
      `SELECT COUNT(*)::int AS count FROM flashcard_progress
       WHERE user_id=$1 AND next_review <= CURRENT_DATE AND interval_days < 28`,
      [req.user.id]
    );
    res.json({ dueCount: due.count });
  } catch (err) { next(err); }
});

// POST /api/flashcards/generate/:subtopicId — auto-generate cards from lessons
router.post("/generate/:subtopicId", authenticate, async (req, res, next) => {
  try {
    const { subtopicId } = req.params;

    const existing = await db.one(
      "SELECT COUNT(*)::int AS count FROM flashcard_decks WHERE user_id=$1 AND subtopic_id=$2 AND is_auto_generated=true",
      [req.user.id, subtopicId]
    );
    if (existing.count > 0) return res.json({ message: "Already generated" });

    const lessons = await db.many(
      `SELECT l.title, l.content, st.name AS subtopic, t.name AS topic, s.name AS subject
       FROM lessons l
       JOIN subtopics st ON st.id = l.subtopic_id
       JOIN topics t ON t.id = st.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE l.subtopic_id=$1 AND l.is_published=true`,
      [subtopicId]
    );
    if (!lessons.length) return res.status(404).json({ error: "No lessons found" });

    const { subtopic, topic, subject } = lessons[0];
    const combinedContent = lessons.map(l => `${l.title}:\n${l.content}`).join('\n\n---\n\n');

    const prompt = `Extract the most important facts from these A-Level ${subject} lessons on "${subtopic}" (${topic}).

Create exactly 12-15 flashcards. Each card should test ONE specific fact.

CONTENT:
${combinedContent.slice(0, 4000)}

Return ONLY a valid JSON array:
[
  { "front": "<specific question>", "back": "<concise factual answer>" }
]

Rules:
- Questions should be specific and testable
- Answers should be concise (1-3 sentences max)
- Cover the most important exam-relevant facts
- No bullet points in answers - write in plain sentences`;

    const GroqSDK = require('groq-sdk');
    const groqClient = new GroqSDK({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 2000,
      messages: [
        { role: "system", content: "You are an expert flashcard creator for A-Level students. Return only valid JSON arrays with no markdown." },
        { role: "user", content: prompt }
      ],
    });
    const text = completion.choices[0].message.content;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: "Failed to generate cards" });

    const cards = JSON.parse(match[0]);

    const deck = await db.one(
      "INSERT INTO flashcard_decks (user_id, subtopic_id, name, is_auto_generated) VALUES ($1,$2,$3,true) RETURNING *",
      [req.user.id, subtopicId, `${subtopic} — ${subject}`]
    );

    for (const card of cards) {
      if (!card.front || !card.back) continue;
      const fc = await db.one(
        "INSERT INTO flashcards (deck_id, user_id, front, back) VALUES ($1,$2,$3,$4) RETURNING id",
        [deck.id, req.user.id, card.front, card.back]
      );
      await db.query(
        "INSERT INTO flashcard_progress (user_id, flashcard_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [req.user.id, fc.id]
      );
    }

    res.json({ deckId: deck.id, cardCount: cards.length });
  } catch (err) { next(err); }
});

// GET /api/flashcards/daily — due card count + per-deck breakdown
router.get("/daily", authenticate, async (req, res, next) => {
  try {
    const due = await db.one(
      `SELECT COUNT(*)::int AS count FROM flashcard_progress
       WHERE user_id=$1 AND next_review <= CURRENT_DATE AND interval_days < 28`,
      [req.user.id]
    );
    const byDeck = await db.many(
      `SELECT f.deck_id, COUNT(*)::int AS due_count
       FROM flashcard_progress fp
       JOIN flashcards f ON f.id = fp.flashcard_id
       WHERE fp.user_id=$1 AND fp.next_review <= CURRENT_DATE AND fp.interval_days < 28
       GROUP BY f.deck_id`,
      [req.user.id]
    ).catch(() => []);
    res.json({ dueCount: due.count, byDeck });
  } catch (err) { next(err); }
});

module.exports = router;
