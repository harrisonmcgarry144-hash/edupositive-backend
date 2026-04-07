const db = require('./index');

// Returns the flashcards due for review today for a user
// based on SM-2 spaced repetition + new cards from their subjects
async function getDailyFlashcards(userId) {
  try {
    // 1. Get cards due for review (SM-2 next_review date)
    const dueCards = await db.many(
      `SELECT f.*, fd.title AS deck_title, s.name AS subject_name,
              fp.next_review, fp.ease_factor, fp.interval_days, fp.repetitions
       FROM flashcards f
       JOIN flashcard_decks fd ON fd.id=f.deck_id
       JOIN subjects s ON s.id=fd.subject_id
       LEFT JOIN flashcard_progress fp ON fp.flashcard_id=f.id AND fp.user_id=$1
       WHERE (
         -- Cards due for review
         (fp.next_review IS NOT NULL AND fp.next_review <= CURRENT_DATE)
         OR
         -- New cards from user's subjects (not yet studied)
         (fp.flashcard_id IS NULL AND fd.subject_id IN (
           SELECT subject_id FROM user_subjects WHERE user_id=$1
         ))
       )
       ORDER BY
         CASE WHEN fp.next_review IS NOT NULL THEN 0 ELSE 1 END,
         fp.next_review ASC NULLS LAST
       LIMIT 30`,
      [userId]
    );

    // Group by subject for the daily plan
    const bySubject = {};
    for (const card of dueCards) {
      if (!bySubject[card.subject_name]) bySubject[card.subject_name] = [];
      bySubject[card.subject_name].push(card);
    }

    const totalDue = dueCards.length;
    const newCards = dueCards.filter(c => !c.next_review).length;
    const reviewCards = totalDue - newCards;

    return {
      cards: dueCards,
      bySubject,
      totalDue,
      newCards,
      reviewCards,
      estimatedMins: Math.ceil(totalDue * 0.5), // ~30 seconds per card
    };
  } catch(e) {
    console.error("[DailyFlashcards] Error:", e.message);
    return { cards: [], bySubject: {}, totalDue: 0, newCards: 0, reviewCards: 0, estimatedMins: 0 };
  }
}

module.exports = { getDailyFlashcards };
