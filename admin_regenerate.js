// admin_regenerate.js - Admin endpoint to regenerate all lessons
const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const { generateLessonsForSubtopic } = require('./lesson_generator');

let isRegenerating = false;
let regenProgress = { done: 0, total: 0, current: "" };

// POST /api/admin/regenerate-all — wipe lessons and regenerate everything
router.post("/regenerate-all", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  if (isRegenerating) return res.json({ message: "Already running", progress: regenProgress });

  isRegenerating = true;

  // Wipe existing lessons
  await db.query("DELETE FROM lessons");

  // Get all subtopics + their subject's exam boards (use first board if multiple)
  const subtopics = await db.many(
    `SELECT st.id AS subtopic_id, s.name AS subject_name, st.name AS subtopic_name,
            COALESCE(s.exam_boards[1], 'AQA') AS exam_board
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     JOIN subjects s ON s.id = t.subject_id
     ORDER BY s.name, t.order_index, st.order_index`
  );

  regenProgress = { done: 0, total: subtopics.length, current: "" };

  // Run in background
  (async () => {
    for (const sub of subtopics) {
      regenProgress.current = `${sub.subject_name} - ${sub.subtopic_name}`;
      try {
        await generateLessonsForSubtopic(sub.subtopic_id, sub.exam_board);
      } catch(e) {
        console.error(`Regen failed for ${sub.subtopic_name}:`, e.message);
      }
      regenProgress.done++;
    }
    isRegenerating = false;
  })();

  res.json({ message: "Regeneration started", total: subtopics.length });
});

// GET /api/admin/regenerate-status
router.get("/regenerate-status", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  res.json({ isRegenerating, progress: regenProgress });
});

module.exports = router;
