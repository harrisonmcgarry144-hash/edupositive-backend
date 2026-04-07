const router = require("express").Router();
const db     = require('./index');
const { authenticate } = require('./authmiddleware');
const { awardXP }     = require('./gamification');

// SM-2 spaced repetition algorithm
function sm2(ef, interval, reps, quality) {
  const q = Math.max(0, Math.min(5, quality));
  if (q < 3) { return { ef: Math.max(1.3, ef - 0.2), interval: 1, reps: 0 }; }
  const newReps     = reps + 1;
  const newInterval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ef);
  const newEf       = Math.max(1.3, ef + 0.1 - (5-q) * (0.08 + (5-q) * 0.02));
  return { ef: newEf, interval: newInterval, reps: newReps };
}

// GET /api/flashcards/decks
router.get("/decks", authenticate, async (req, res, next) => {
  try {
    const { subjectId, isPublic } = req.query;
    let q = `
      SELECT fd.*, u.username AS creator_name, COUNT(f.id)::int AS card_count
      FROM flashcard_decks fd
      JOIN users u ON u.id=fd.user_id
      LEFT JOIN flashcards f ON f.deck_id=fd.id
      WHERE `;
    const params = [];
    if (isPublic === "true") {
      q += `fd.is_public=true`;
    } else {
      q += `fd.user_id=$${params.push(req.user.id)}`;
    }
    if (subjectId) q += ` AND fd.subject_id=$${params.push(subjectId)}`;
    q += " GROUP BY fd.id, u.username ORDER BY fd.created_at DESC";
    res.json(await db.many(q, params));
  } catch (err) { next(err); }
});

// POST /api/flashcards/decks
router.post("/decks", authenticate, async (req, res, next) => {
  try {
    const { title, subjectId, topicId, isPublic } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });
    const deck = await db.one(
      `INSERT INTO flashcard_decks (user_id, title, subject_id, topic_id, is_public)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, title, subjectId || null, topicId || null, isPublic ?? false]
    );
    res.status(201).json(deck);
  } catch (err) { next(err); }
});

// PUT /api/flashcards/decks/:id
router.put("/decks/:id", authenticate, async (req, res, next) => {
  try {
    const deck = await db.one("SELECT user_id FROM flashcard_decks WHERE id=$1", [req.params.id]);
    if (!deck) return res.status(404).json({ error: "Deck not found" });
    if (deck.user_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "Not authorised" });
    const { title, isPublic } = req.body;
    const updated = await db.one(
      "UPDATE flashcard_decks SET title=COALESCE($1,title), is_public=COALESCE($2,is_public) WHERE id=$3 RETURNING *",
      [title, isPublic, req.params.id]
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/flashcards/decks/:id
router.delete("/decks/:id", authenticate, async (req, res, next) => {
  try {
    const deck = await db.one("SELECT user_id, is_official FROM flashcard_decks WHERE id=$1", [req.params.id]);
    if (!deck) return res.status(404).json({ error: "Deck not found" });
    if (deck.is_official && req.user.role !== "admin")
      return res.status(403).json({ error: "Cannot delete official decks" });
    if (deck.user_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "Not authorised" });
    await db.query("DELETE FROM flashcard_decks WHERE id=$1", [req.params.id]);
    res.json({ message: "Deck deleted" });
  } catch (err) { next(err); }
});

// GET /api/flashcards/decks/:id/cards
router.get("/decks/:id/cards", authenticate, async (req, res, next) => {
  try {
    const cards = await db.many(
      `SELECT f.*, fp.ease_factor, fp.interval_days, fp.repetitions,
              fp.next_review, fp.correct_count, fp.incorrect_count
       FROM flashcards f
       LEFT JOIN flashcard_progress fp ON fp.flashcard_id=f.id AND fp.user_id=$1
       WHERE f.deck_id=$2 ORDER BY f.created_at`,
      [req.user.id, req.params.id]
    );
    res.json(cards);
  } catch (err) { next(err); }
});

// GET /api/flashcards/due  — cards due today
router.get("/due", authenticate, async (req, res, next) => {
  try {
    const cards = await db.many(
      `SELECT f.*, fd.title AS deck_title, fp.ease_factor, fp.interval_days, fp.next_review
       FROM flashcards f
       JOIN flashcard_decks fd ON fd.id=f.deck_id
       LEFT JOIN flashcard_progress fp ON fp.flashcard_id=f.id AND fp.user_id=$1
       WHERE (fp.next_review IS NULL OR fp.next_review <= CURRENT_DATE)
         AND (fd.user_id=$1 OR fd.is_public=true)
       ORDER BY COALESCE(fp.next_review, CURRENT_DATE)
       LIMIT 50`,
      [req.user.id]
    );
    res.json(cards);
  } catch (err) { next(err); }
});

// POST /api/flashcards/cards
router.post("/cards", authenticate, async (req, res, next) => {
  try {
    const { deckId, question, answer, hint, tags } = req.body;
    if (!deckId || !question || !answer)
      return res.status(400).json({ error: "deckId, question and answer required" });

    const deck = await db.one("SELECT user_id, is_official FROM flashcard_decks WHERE id=$1", [deckId]);
    if (!deck) return res.status(404).json({ error: "Deck not found" });
    if (deck.is_official && req.user.role !== "admin")
      return res.status(403).json({ error: "Cannot add cards to official decks" });
    if (deck.user_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "Not your deck" });

    const card = await db.one(
      "INSERT INTO flashcards (deck_id, question, answer, hint, tags) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [deckId, question, answer, hint || null, tags || []]
    );
    res.status(201).json(card);
  } catch (err) { next(err); }
});

// PUT /api/flashcards/cards/:id
router.put("/cards/:id", authenticate, async (req, res, next) => {
  try {
    const card = await db.one(
      `SELECT f.id, fd.user_id, fd.is_official
       FROM flashcards f JOIN flashcard_decks fd ON fd.id=f.deck_id WHERE f.id=$1`,
      [req.params.id]
    );
    if (!card) return res.status(404).json({ error: "Card not found" });
    if (card.is_official && req.user.role !== "admin")
      return res.status(403).json({ error: "Cannot edit official cards" });
    if (card.user_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "Not authorised" });

    const { question, answer, hint, tags } = req.body;
    const updated = await db.one(
      `UPDATE flashcards SET question=COALESCE($1,question), answer=COALESCE($2,answer),
       hint=COALESCE($3,hint), tags=COALESCE($4,tags) WHERE id=$5 RETURNING *`,
      [question, answer, hint, tags, req.params.id]
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/flashcards/cards/:id
router.delete("/cards/:id", authenticate, async (req, res, next) => {
  try {
    const card = await db.one(
      `SELECT f.id, fd.user_id, fd.is_official
       FROM flashcards f JOIN flashcard_decks fd ON fd.id=f.deck_id WHERE f.id=$1`,
      [req.params.id]
    );
    if (!card) return res.status(404).json({ error: "Card not found" });
    if (card.is_official && req.user.role !== "admin")
      return res.status(403).json({ error: "Cannot delete official cards" });
    if (card.user_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "Not authorised" });
    await db.query("DELETE FROM flashcards WHERE id=$1", [req.params.id]);
    res.json({ message: "Card deleted" });
  } catch (err) { next(err); }
});

// POST /api/flashcards/review
router.post("/review", authenticate, async (req, res, next) => {
  try {
    const { flashcardId, quality } = req.body; // quality 0-5
    if (quality == null) return res.status(400).json({ error: "quality (0-5) required" });

    const existing = await db.one(
      "SELECT * FROM flashcard_progress WHERE user_id=$1 AND flashcard_id=$2",
      [req.user.id, flashcardId]
    );
    const { ef, interval, reps } = sm2(
      existing?.ease_factor ?? 2.5,
      existing?.interval_days ?? 1,
      existing?.repetitions ?? 0,
      quality
    );
    const nextReview  = new Date(Date.now() + interval * 86400000).toISOString().slice(0,10);
    const isCorrect   = quality >= 3;

    await db.query(
      `INSERT INTO flashcard_progress
         (user_id, flashcard_id, ease_factor, interval_days, repetitions, next_review, last_reviewed, correct_count, incorrect_count)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8)
       ON CONFLICT (user_id, flashcard_id) DO UPDATE SET
         ease_factor=$3, interval_days=$4, repetitions=$5, next_review=$6,
         last_reviewed=NOW(),
         correct_count  = flashcard_progress.correct_count + $7,
         incorrect_count= flashcard_progress.incorrect_count + $8`,
      [req.user.id, flashcardId, ef, interval, reps, nextReview, isCorrect ? 1 : 0, isCorrect ? 0 : 1]
    );

    if (isCorrect) await awardXP(req.user.id, 5, "flashcard_correct", flashcardId);
    res.json({ easeFactor: ef, intervalDays: interval, nextReview, correct: isCorrect });
  } catch (err) { next(err); }
});

// POST /api/flashcards/session-complete
router.post("/session-complete", authenticate, async (req, res, next) => {
  try {
    const { deckId, correctCount, totalCount } = req.body;
    const xp = Math.max(10, Math.round((correctCount / (totalCount || 1)) * 50) + 10);
    const result = await awardXP(req.user.id, xp, "flashcard_session", deckId);
    res.json({ xpEarned: xp, ...result });
  } catch (err) { next(err); }
});

// POST /api/flashcards/compete — challenge a friend
router.post("/compete", authenticate, async (req, res, next) => {
  try {
    const { opponentId, deckId } = req.body;
    const comp = await db.one(
      "INSERT INTO competitions (deck_id, challenger_id, opponent_id) VALUES ($1,$2,$3) RETURNING *",
      [deckId, req.user.id, opponentId]
    );
    req.app.get("io").to(`user:${opponentId}`).emit("competition_invite", {
      competition: comp, challengerId: req.user.id,
    });
    res.status(201).json(comp);
  } catch (err) { next(err); }
});

// PUT /api/flashcards/compete/:id/respond
router.put("/compete/:id/respond", authenticate, async (req, res, next) => {
  try {
    const { accept } = req.body;
    const status = accept ? "active" : "complete";
    const comp = await db.one(
      "UPDATE competitions SET status=$1 WHERE id=$2 AND opponent_id=$3 RETURNING *",
      [status, req.params.id, req.user.id]
    );
    if (comp) {
      req.app.get("io").to(`user:${comp.challenger_id}`).emit("competition_response", { comp, accepted: accept });
    }
    res.json(comp);
  } catch (err) { next(err); }
});
// GET /api/flashcards/daily
router.get("/daily", authenticate, async (req, res, next) => {
  try {
    const { getDailyFlashcards } = require('./daily_flashcards');
    const daily = await getDailyFlashcards(req.user.id);
    res.json(daily);
  } catch (err) { next(err); }
});
module.exports = router;