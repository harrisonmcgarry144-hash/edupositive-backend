const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const { generateLessonsForSubtopic, generateLessonsForSubject, isSubjectGenerated, getGenerationProgress } = require('./lesson_generator');

// Track active generation jobs
const activeJobs = new Map(); // subjectId+board -> { progress, total, status }

// GET /api/generate/status/:subjectId/:board
router.get("/status/:subjectId/:board", authenticate, async (req, res, next) => {
  try {
    const { subjectId, board } = req.params;
    const key = `${subjectId}:${board}`;
    
    const job = activeJobs.get(key);
    if (job) {
      return res.json({ status: job.status, progress: job.progress, total: job.total });
    }

    const progress = await getGenerationProgress(subjectId, board);
    const isReady = progress.done >= progress.total && progress.total > 0;
    
    res.json({ 
      status: isReady ? 'complete' : 'not_started',
      progress: progress.done,
      total: progress.total,
    });
  } catch (err) { next(err); }
});

// POST /api/generate/start/:subjectId/:board
router.post("/start/:subjectId/:board", authenticate, async (req, res, next) => {
  try {
    const { subjectId, board } = req.params;
    const key = `${subjectId}:${board}`;

    // Don't start if already running
    if (activeJobs.get(key)?.status === 'running') {
      return res.json({ message: "Already generating" });
    }

    const progress = await getGenerationProgress(subjectId, board);
    
    // Don't start if already complete
    if (progress.done >= progress.total && progress.total > 0) {
      return res.json({ message: "Already complete", status: "complete" });
    }

    // Start generation in background
    activeJobs.set(key, { status: 'running', progress: progress.done, total: progress.total });
    
    generateLessonsForSubject(subjectId, board, (done, total) => {
      activeJobs.set(key, { status: 'running', progress: done, total });
    }).then(() => {
      activeJobs.set(key, { status: 'complete', progress: progress.total, total: progress.total });
      setTimeout(() => activeJobs.delete(key), 60000);
    }).catch((e) => {
      console.error(`Generation failed for ${key}:`, e.message);
      activeJobs.set(key, { status: 'error', progress: 0, total: progress.total });
    });

    res.json({ message: "Generation started", status: "running", total: progress.total });
  } catch (err) { next(err); }
});

// GET /api/generate/user-subjects-status — check all user's subjects
router.get("/user-subjects-status", authenticate, async (req, res, next) => {
  try {
    const userSubjects = await db.manyOrNone(
      `SELECT s.id, s.name, us.exam_board
       FROM user_subjects us
       JOIN subjects s ON s.id = us.subject_id
       WHERE us.user_id = $1`,
      [req.user.id]
    );

    const statuses = await Promise.all(userSubjects.map(async (us) => {
      const board = us.exam_board || 'AQA';
      const key = `${us.id}:${board}`;
      const job = activeJobs.get(key);
      
      if (job) return { subjectId: us.id, name: us.name, board, ...job };
      
      const progress = await getGenerationProgress(us.id, board);
      return {
        subjectId: us.id,
        name: us.name,
        board,
        status: (progress.done >= progress.total && progress.total > 0) ? 'complete' : 'not_started',
        progress: progress.done,
        total: progress.total,
      };
    }));

    res.json(statuses);
  } catch (err) { next(err); }
});

// POST /api/generate/subtopic/:subtopicId — generate lessons for one subtopic
router.post("/subtopic/:subtopicId", authenticate, async (req, res, next) => {
  try {
    const { subtopicId } = req.params;
    const key = `subtopic:${subtopicId}`;

    if (activeJobs.get(key)?.status === 'running') {
      return res.json({ status: 'running' });
    }

    // Look up the user's exam board for the subject containing this subtopic
    const row = await db.one(
      `SELECT us.exam_board FROM user_subjects us
       JOIN subjects s ON s.id = us.subject_id
       JOIN topics t ON t.subject_id = s.id
       JOIN subtopics st ON st.topic_id = t.id
       WHERE st.id = $1 AND us.user_id = $2
       LIMIT 1`,
      [subtopicId, req.user.id]
    );
    const board = row?.exam_board || 'AQA';

    activeJobs.set(key, { status: 'running' });

    generateLessonsForSubtopic(subtopicId, board)
      .then(() => activeJobs.set(key, { status: 'complete' }))
      .catch(e => {
        console.error(`[SubtopicGen] Failed ${subtopicId}:`, e.message);
        activeJobs.set(key, { status: 'error' });
      })
      .finally(() => setTimeout(() => activeJobs.delete(key), 60000));

    res.json({ status: 'generating', board });
  } catch (err) { next(err); }
});

module.exports = router;
