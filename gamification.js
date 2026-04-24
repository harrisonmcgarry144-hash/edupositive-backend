const router = require("express").Router();
const db     = require('./index');
const { authenticate } = require('./authmiddleware');

const XP_VALUES = {
  lesson_read: 15,
  lesson_completed: 50,
  all_lessons_subtopic: 100,
  question_attempted: 5,
  question_correct: 20,
  question_streak_3: 30,
  question_streak_5: 60,
  quick_check_correct: 15,
  quick_check_attempted: 3,
  blurt_submitted: 25,
  blurt_score_50: 30,
  blurt_score_80: 60,
  blurt_perfect: 100,
  mindmap_submitted: 20,
  mindmap_score_70: 40,
  rapidfire_completed: 30,
  rapidfire_score_70: 50,
  boss_battle_attempted: 40,
  boss_battle_passed: 100,
  recall_completed: 30,
  flashcard_reviewed: 5,
  flashcard_correct: 10,
  flashcard_mastered: 25,
  flashcard_deck_completed: 50,
  flashcard_deck_created: 20,
  daily_login: 10,
  streak_3: 30,
  streak_7: 75,
  streak_14: 150,
  streak_30: 300,
  streak_100: 1000,
  pomodoro_complete: 25,
  friend_added: 15,
  forum_post: 10,
  forum_upvote_received: 5,
  profile_completed: 50,
  avatar_set: 20,
  subjects_selected: 30,
  onboarding_done: 100,
  past_paper_attempted: 50,
  past_paper_completed: 100,
  supercurricular_generated: 30,
  study_30_mins: 25,
  study_60_mins: 60,
  study_120_mins: 150,
};

async function awardXP(userId, amountOrKey, reason, refId) {
  try {
    const amount = typeof amountOrKey === 'string'
      ? (XP_VALUES[amountOrKey] || XP_VALUES[reason] || 10)
      : amountOrKey;

    await db.query(
      "INSERT INTO xp_events (user_id, amount, reason, ref_id) VALUES ($1,$2,$3,$4)",
      [userId, amount, reason || amountOrKey, refId || null]
    ).catch(() => {});

    const user = await db.one(
      "UPDATE users SET xp=xp+$1 WHERE id=$2 RETURNING xp, level",
      [amount, userId]
    );

    const newLevel = Math.floor(user.xp / 500) + 1;
    if (newLevel > user.level) {
      await db.query("UPDATE users SET level=$1 WHERE id=$2", [newLevel, userId]);
    }

    // Streak milestone bonuses
    const streakUser = await db.one("SELECT streak FROM users WHERE id=$1", [userId]).catch(() => null);
    if (streakUser) {
      const s = streakUser.streak;
      const milestoneKey = s === 3 ? 'streak_3' : s === 7 ? 'streak_7' : s === 14 ? 'streak_14' : s === 30 ? 'streak_30' : s === 100 ? 'streak_100' : null;
      if (milestoneKey) {
        const already = await db.one(
          "SELECT COUNT(*)::int AS count FROM xp_events WHERE user_id=$1 AND reason=$2 AND created_at > NOW() - INTERVAL '25 hours'",
          [userId, milestoneKey]
        ).catch(() => ({ count: 1 }));
        if (already.count === 0) {
          await db.query("INSERT INTO xp_events (user_id, amount, reason) VALUES ($1,$2,$3)", [userId, XP_VALUES[milestoneKey], milestoneKey]).catch(() => {});
          await db.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [XP_VALUES[milestoneKey], userId]).catch(() => {});
        }
      }
    }

    return { xp: user.xp, level: newLevel, earned: amount };
  } catch(e) {
    console.error("awardXP error:", e.message);
    return { xp: 0, level: 1, earned: 0 };
  }
}

async function seedAchievements() {}

// Leaderboard
router.get("/leaderboard", authenticate, async (req, res, next) => {
  try {
    const users = await db.many(
      `SELECT u.id, u.username, u.xp, u.level, u.streak, u.avatar_url, u.rank, u.is_top100,
              (u.id = $1) AS "isMe"
       FROM users u
       WHERE u.id = $1
       OR u.id IN (
         SELECT CASE WHEN requester=$1 THEN receiver ELSE requester END
         FROM friendships WHERE (requester=$1 OR receiver=$1) AND status='accepted'
       )
       ORDER BY u.xp DESC LIMIT 20`,
      [req.user.id]
    );
    res.json(users.map((u, i) => ({ ...u, rank: i + 1 })));
  } catch (err) { next(err); }
});

// Achievements
router.get("/achievements", authenticate, async (req, res, next) => {
  try {
    await seedAchievements();
    const all = await db.many(
      `SELECT a.*, ua.earned_at
       FROM achievements a
       LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=$1
       ORDER BY ua.earned_at DESC NULLS LAST, a.xp_reward DESC`,
      [req.user.id]
    );
    res.json(all);
  } catch (err) { next(err); }
});

// Pomodoro
router.post("/pomodoro/start", authenticate, async (req, res, next) => {
  try {
    const { durationMins, contextType, contextId } = req.body;
    const session = await db.one(
      `INSERT INTO pomodoro_sessions (user_id, duration_mins, context_type, context_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.id, durationMins || 25, contextType || null, contextId || null]
    );
    res.status(201).json(session);
  } catch (err) { next(err); }
});

router.post("/pomodoro/:id/complete", authenticate, async (req, res, next) => {
  try {
    await db.query(
      "UPDATE pomodoro_sessions SET completed=true, ended_at=NOW() WHERE id=$1 AND user_id=$2",
      [req.params.id, req.user.id]
    );
    const result = await awardXP(req.user.id, 25, "pomodoro_complete", req.params.id);
    res.json({ message: "Pomodoro complete! Take a break.", xpAwarded: 25, ...result });
  } catch (err) { next(err); }
});

// Stats
router.get("/stats", authenticate, async (req, res, next) => {
  try {
    const [xpToday, pomosThisWeek, totalPomos] = await Promise.all([
      db.one("SELECT COALESCE(SUM(amount),0)::int AS xp FROM xp_events WHERE user_id=$1 AND DATE(created_at)=CURRENT_DATE", [req.user.id]),
      db.one("SELECT COUNT(*)::int AS count FROM pomodoro_sessions WHERE user_id=$1 AND completed=true AND started_at > NOW()-INTERVAL '7 days'", [req.user.id]),
      db.one("SELECT COUNT(*)::int AS count FROM pomodoro_sessions WHERE user_id=$1 AND completed=true", [req.user.id]),
    ]);
    res.json({ xpToday: xpToday.xp, pomosThisWeek: pomosThisWeek.count, totalPomos: totalPomos.count });
  } catch (err) { next(err); }
});

// ── Real active users tracker ─────────────────────────────────────────────────
const activeSessions = new Map(); // userId -> lastSeen timestamp

// Heartbeat — frontend calls this every 60s while user is on the site
router.post("/heartbeat", authenticate, async (req, res) => {
  activeSessions.set(req.user.id, Date.now());
  // Also update last_active in DB
  await db.query("UPDATE users SET last_active=NOW() WHERE id=$1", [req.user.id]).catch(() => {});
  res.json({ ok: true });
});

// Clean stale sessions every 60 seconds (5 min timeout)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, ts] of activeSessions.entries()) {
    if (ts < cutoff) activeSessions.delete(id);
  }
}, 60 * 1000);

router.get("/revising-now", async (req, res, next) => {
  try {
    const realCount = activeSessions.size;
    // Fallback: DB users active in last 5 mins
    const dbCount = await db.one(
      "SELECT COUNT(*)::int AS count FROM users WHERE last_active >= NOW() - INTERVAL '5 minutes'"
    ).catch(() => ({ count: 0 }));
    res.json({ count: Math.max(realCount, dbCount.count) });
  } catch (err) { next(err); }
});

module.exports = { router, awardXP, seedAchievements };
