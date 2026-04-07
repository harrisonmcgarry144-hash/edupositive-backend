const db = require("../db");

const XP_PER_LEVEL = 500;
const getLevel = (xp) => Math.floor(xp / XP_PER_LEVEL) + 1;

const ACHIEVEMENT_DEFS = [
  { key: "first_lesson",     title: "First Step",       icon: "📚", xp: 50,  desc: "Read your first lesson" },
  { key: "first_flashcard",  title: "Card Sharp",       icon: "🃏", xp: 25,  desc: "Reviewed your first flashcard" },
  { key: "first_exam",       title: "Test Drive",       icon: "📝", xp: 100, desc: "Submitted your first exam" },
  { key: "first_blurt",      title: "Brain Dump",       icon: "🧠", xp: 75,  desc: "Completed your first blurt session" },
  { key: "first_feynman",    title: "Teach to Learn",   icon: "🎓", xp: 75,  desc: "Completed your first Feynman session" },
  { key: "streak_3",         title: "Habit Forming",    icon: "🔥", xp: 50,  desc: "3-day study streak" },
  { key: "streak_7",         title: "Week Warrior",     icon: "⚡", xp: 100, desc: "7-day study streak" },
  { key: "streak_30",        title: "Unstoppable",      icon: "🌟", xp: 500, desc: "30-day study streak" },
  { key: "level_5",          title: "Rising Scholar",   icon: "📈", xp: 200, desc: "Reached Level 5" },
  { key: "level_10",         title: "Academic",         icon: "🏛️", xp: 500, desc: "Reached Level 10" },
  { key: "perfect_blurt",    title: "Total Recall",     icon: "💡", xp: 150, desc: "Scored 90%+ on a blurt session" },
  { key: "100_flashcards",   title: "Card Master",      icon: "🎴", xp: 200, desc: "Reviewed 100 flashcards" },
  { key: "top3_leaderboard", title: "Top of the Class", icon: "🏆", xp: 300, desc: "Reached top 3 on the leaderboard" },
];

async function seedAchievements() {
  for (const a of ACHIEVEMENT_DEFS) {
    await db.query(
      `INSERT INTO achievements (key, title, description, icon, xp_reward)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key) DO NOTHING`,
      [a.key, a.title, a.desc, a.icon, a.xp]
    );
  }
}

async function awardXP(userId, amount, reason, refId = null) {
  return db.transaction(async (client) => {
    await client.query(
      "INSERT INTO xp_events (user_id, amount, reason, ref_id) VALUES ($1,$2,$3,$4)",
      [userId, amount, reason, refId]
    );
    const { rows } = await client.query(
      "UPDATE users SET xp=xp+$1, updated_at=NOW() WHERE id=$2 RETURNING xp, level, streak",
      [amount, userId]
    );
    const user    = rows[0];
    const newLevel = getLevel(user.xp);
    let levelUp   = false;
    if (newLevel !== user.level) {
      await client.query("UPDATE users SET level=$1 WHERE id=$2", [newLevel, userId]);
      levelUp = true;
    }
    await checkAchievements(userId, { ...user, level: newLevel }, client);
    return { xp: user.xp, level: newLevel, levelUp };
  });
}

async function checkAchievements(userId, user, client) {
  const { rows } = await client.query(
    `SELECT a.key FROM achievements a
     JOIN user_achievements ua ON ua.achievement_id=a.id
     WHERE ua.user_id=$1`,
    [userId]
  );
  const has = new Set(rows.map(r => r.key));

  const toGrant = [];

  if (user.streak >= 3  && !has.has("streak_3"))         toGrant.push("streak_3");
  if (user.streak >= 7  && !has.has("streak_7"))         toGrant.push("streak_7");
  if (user.streak >= 30 && !has.has("streak_30"))        toGrant.push("streak_30");
  if (user.level >= 5   && !has.has("level_5"))          toGrant.push("level_5");
  if (user.level >= 10  && !has.has("level_10"))         toGrant.push("level_10");

  for (const key of toGrant) {
    await grantAchievement(userId, key, client);
  }
}

async function grantAchievement(userId, key, client) {
  const { rows } = await client.query("SELECT id, xp_reward FROM achievements WHERE key=$1", [key]);
  if (!rows[0]) return;
  await client.query(
    "INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [userId, rows[0].id]
  );
  if (rows[0].xp_reward > 0) {
    await client.query("UPDATE users SET xp=xp+$1 WHERE id=$2", [rows[0].xp_reward, userId]);
    await client.query(
      "INSERT INTO xp_events (user_id, amount, reason) VALUES ($1,$2,$3)",
      [userId, rows[0].xp_reward, `achievement_${key}`]
    );
  }
}

module.exports = { awardXP, seedAchievements, getLevel, grantAchievement };
