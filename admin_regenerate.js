const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const { generateLessonsForSubtopic } = require('./lesson_generator');

const DAILY_LIMIT = 1500; // Gemini free tier

let isRegenerating = false;
let regenProgress = { done: 0, total: 0, current: "", errors: 0, todayCount: 0 };

async function initDailyTracker() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ai_daily_usage (
      date DATE PRIMARY KEY,
      lessons_generated INT NOT NULL DEFAULT 0
    )
  `).catch(() => {});
}

async function getTodayUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.one(
    `INSERT INTO ai_daily_usage (date, lessons_generated) VALUES ($1, 0)
     ON CONFLICT (date) DO UPDATE SET lessons_generated = ai_daily_usage.lessons_generated
     RETURNING lessons_generated`,
    [today]
  ).catch(() => ({ lessons_generated: 0 }));
  return row.lessons_generated;
}

async function incrementTodayUsage(count = 1) {
  const today = new Date().toISOString().slice(0, 10);
  await db.query(
    `INSERT INTO ai_daily_usage (date, lessons_generated) VALUES ($1, $2)
     ON CONFLICT (date) DO UPDATE SET lessons_generated = ai_daily_usage.lessons_generated + $2`,
    [today, count]
  ).catch(() => {});
}

async function countLessonsForSubtopic(subtopicId, examBoard) {
  const row = await db.one(
    `SELECT COUNT(*)::int AS count FROM lessons WHERE subtopic_id=$1 AND exam_board=$2`,
    [subtopicId, examBoard]
  ).catch(() => ({ count: 0 }));
  return row.count;
}

async function runRegeneration(wipeFirst = false) {
  if (isRegenerating) return;
  isRegenerating = true;

  try {
    await initDailyTracker();

    if (wipeFirst) {
      await db.query("DELETE FROM lessons WHERE is_ai_generated=true");
    }

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
    const todayUsed = await getTodayUsage();
    regenProgress = {
      done: subtopics.length - todo.length,
      total: subtopics.length,
      current: "",
      errors: 0,
      todayCount: todayUsed,
      dailyLimit: DAILY_LIMIT,
    };

    console.log(`[Regen] Starting. ${todo.length} subtopics remaining. Today used: ${todayUsed}/${DAILY_LIMIT}`);

    for (const sub of todo) {
      const currentUsage = await getTodayUsage();
      if (currentUsage >= DAILY_LIMIT) {
        console.log(`[Regen] Daily limit of ${DAILY_LIMIT} reached. Pausing until tomorrow.`);
        regenProgress.current = `Daily limit reached. Continuing tomorrow.`;
        regenProgress.todayCount = currentUsage;
        break;
      }

      regenProgress.current = `${sub.subject_name} - ${sub.subtopic_name}`;
      regenProgress.todayCount = currentUsage;

      try {
        const lessonsBefore = await countLessonsForSubtopic(sub.subtopic_id, sub.exam_board);
        await generateLessonsForSubtopic(sub.subtopic_id, sub.exam_board);
        const lessonsAfter = await countLessonsForSubtopic(sub.subtopic_id, sub.exam_board);
        const newLessons = lessonsAfter - lessonsBefore;
        if (newLessons > 0) {
          await incrementTodayUsage(newLessons);
        }
      } catch (e) {
        console.error(`[Regen] Failed for ${sub.subtopic_name}:`, e.message);
        regenProgress.errors++;
      }
      regenProgress.done++;
    }

    regenProgress.current = regenProgress.done >= regenProgress.total ? "Complete!" : "Paused for today";
  } catch (e) {
    console.error("[Regen] Critical error:", e);
  } finally {
    isRegenerating = false;
  }
}

router.post("/regenerate-all", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  if (isRegenerating) return res.json({ message: "Already running", progress: regenProgress });
  runRegeneration(true).catch(e => { console.error("Regen crashed:", e); isRegenerating = false; });
  res.json({ message: "Regeneration started (wipe mode)" });
});

router.post("/regenerate-continue", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  if (isRegenerating) return res.json({ message: "Already running", progress: regenProgress });
  runRegeneration(false).catch(e => { console.error("Regen crashed:", e); isRegenerating = false; });
  res.json({ message: "Regeneration resumed" });
});

router.get("/regenerate-status", authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
  const todayUsed = await getTodayUsage();
  res.json({
    isRegenerating,
    progress: { ...regenProgress, todayCount: todayUsed, dailyLimit: DAILY_LIMIT },
  });
});

// Auto-resume on server startup (no user needs to be online)
setTimeout(() => {
  console.log("[Regen] Server boot - auto-resuming lesson generation...");
  runRegeneration(false).catch(e => console.error("Auto-regen crashed:", e));
}, 30000);

// Hourly check - picks up again after daily limit resets at midnight
setInterval(() => {
  if (!isRegenerating) {
    console.log("[Regen] Hourly check - resuming...");
    runRegeneration(false).catch(e => console.error("Hourly-regen crashed:", e));
  }
}, 60 * 60 * 1000);

module.exports = router;
