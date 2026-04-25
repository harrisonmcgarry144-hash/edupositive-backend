const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');

const RANKS = [
  { name: "Champion", emoji: "⚡", color: "#00BFFF", minPct: 98 },
  { name: "Diamond",  emoji: "💎", color: "#a78bfa", minPct: 90 },
  { name: "Gold",     emoji: "🥇", color: "#f59e0b", minPct: 70 },
  { name: "Silver",   emoji: "🥈", color: "#94a3b8", minPct: 40 },
  { name: "Bronze",   emoji: "🥉", color: "#cd7f32", minPct: 0  },
];

function getRankFromPercentile(percentile) {
  if (percentile >= 98) return RANKS[0];
  if (percentile >= 90) return RANKS[1];
  if (percentile >= 70) return RANKS[2];
  if (percentile >= 40) return RANKS[3];
  return RANKS[4];
}

async function updateRanks() {
  try {
    console.log("[Ranks] Updating ranks...");
    const users = await db.many("SELECT id, xp FROM users ORDER BY xp DESC");
    const total = users.length;
    if (!total) return;
    const top100Ids = new Set(users.slice(0, Math.min(100, total)).map(u => u.id));
    const rankData = users.map((user, i) => {
      const percentile = total === 1 ? 50 : ((total - i - 1) / (total - 1)) * 100;
      return { id: user.id, rank: getRankFromPercentile(percentile).name, pct: Math.round(percentile), top: top100Ids.has(user.id) };
    });
    await db.query(
      `UPDATE users u SET rank=v->>'rank', rank_percentile=(v->>'pct')::int, is_top100=(v->>'top')::boolean
       FROM jsonb_array_elements($1::jsonb) AS v WHERE u.id=(v->>'id')::uuid`,
      [JSON.stringify(rankData)]
    );
    console.log(`[Ranks] Updated ${total} users`);
  } catch (e) { console.error("[Ranks] Error:", e.message); }
}

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await db.one(
      "SELECT id, username, xp, level, rank, rank_percentile, is_top100 FROM users WHERE id=$1",
      [req.user.id]
    );
    const rankDef = RANKS.find(r => r.name === user.rank) || RANKS[RANKS.length - 1];
    res.json({ rank: user.rank || "Bronze", percentile: user.rank_percentile || 0, isTop100: user.is_top100 || false, emoji: rankDef.emoji, color: rankDef.color });
  } catch (err) { next(err); }
});

router.get("/leaderboard", authenticate, async (req, res, next) => {
  try {
    const users = await db.many(
      `SELECT id, username, xp, level, streak, rank, rank_percentile, is_top100, (id = $1) AS "isMe"
       FROM users ORDER BY xp DESC LIMIT 100`,
      [req.user.id]
    );
    res.json(users.map((u, i) => ({ ...u, position: i + 1, rankDef: RANKS.find(r => r.name === u.rank) || RANKS[RANKS.length - 1] })));
  } catch (err) { next(err); }
});

module.exports = { router, updateRanks, RANKS };
