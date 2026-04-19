const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const { generateLessonsForSubtopic } = require('./lesson_generator');

let isRegenerating = false;
let regenProgress = { done: 0, total: 0, current: "", errors: 0 };

async function runRegeneration(wipeFirst = false) {
  if (isRegenerating) return;
  isRegenerating = true;

  if (wipeFirst) await db.query("DELETE FROM lessons WHERE is_ai_generated=true");

  const subtopics = await db.many(
    `SELECT st.id AS subtopic_id, s.name AS subject_name, st.name AS subtopic_name,
            COALESCE(s.exam_boards[1], 'AQA') AS exam_board,
            EXISTS (SELECT 1 FROM lessons l WHERE l.subtopic_id = st.id) AS already_done
     FROM subtopics st
     JOIN topics t ON t.id = st.topic_id
     JOIN subjects s ON s.id = t.subject_id
     ORDER BY s.name, t.order_index, st.order_index`
  );

  const todo = subtopics.filter(s => !s.already_done);
  regenProgress = { done: subtopics.length - todo.length, total: subtopics.length, current: "", errors: 0 };

  for (const sub of todo) {
    regenProgress.current = `${sub.subject_name} - ${sub.subtopic_name}`;
    try {
      await generateLessonsForSubtopic(sub.subtopic_id, sub.exam_board);
    } catch(e) {
      console.error(`Regen failed for ${sub.subtopic_name}:`, e.message);
      regenProgress.errors++;
    }
    regenProgress.done++;
  }
  isRegenerating = false;
  regenProgress.current = "Complete!";
}

// POST /api/admin/regenerate-all — wipe and regen
router.post("/regenerate-all", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  if (isRegenerating) return res.json({ message: "Already running", progress: regenProgress });
  runRegeneration(true).catch(e => { console.error("Regen crashed:", e); isRegenerating = false; });
  res.json({ message: "Regeneration started (wipe mode)" });
});

// POST /api/admin/regenerate-continue — continue without wiping
router.post("/regenerate-continue", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  if (isRegenerating) return res.json({ message: "Already running", progress: regenProgress });
  runRegeneration(false).catch(e => { console.error("Regen crashed:", e); isRegenerating = false; });
  res.json({ message: "Regeneration resumed (keeps existing)" });
});

router.get("/regenerate-status", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  res.json({ isRegenerating, progress: regenProgress });
});

// Auto-resume on server startup
setTimeout(() => {
  console.log("[Regen] Auto-resuming lesson generation...");
  runRegeneration(false).catch(e => console.error("Auto-regen crashed:", e));
}, 30000); // Wait 30s after startup

module.exports = router;
