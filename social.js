const router = require("express").Router();
const db     = require('./index');
const { authenticate } = require('./authmiddleware');

// ── User search ───────────────────────────────────────────────────────────────

router.get("/users/search", authenticate, async (req, res, next) => {
  try {
    const { q, school } = req.query;
    const p = [req.user.id];
    let query = `SELECT id, username, full_name, avatar_url, xp, level, streak, school
                 FROM users WHERE id!=$1 AND is_public=true`;
    if (q)      query += ` AND (username ILIKE $${p.push(`%${q}%`)} OR full_name ILIKE $${p.length})`;
    if (school) query += ` AND school ILIKE $${p.push(`%${school}%`)}`;
    query += " LIMIT 20";
    res.json(await db.many(query, p));
  } catch (err) { next(err); }
});

// ── Friendships ───────────────────────────────────────────────────────────────

router.post("/friends/request", authenticate, async (req, res, next) => {
  try {
    const { receiverId } = req.body;
    if (receiverId === req.user.id) return res.status(400).json({ error: "Cannot friend yourself" });
    const f = await db.one(
      `INSERT INTO friendships (requester, receiver) VALUES ($1,$2)
       ON CONFLICT (requester,receiver) DO NOTHING RETURNING *`,
      [req.user.id, receiverId]
    );
    if (f) {
      req.app.get("io").to(`user:${receiverId}`).emit("friend_request", { from: req.user.id });
    }
    res.json(f || { message: "Request already sent" });
  } catch (err) { next(err); }
});

router.put("/friends/:id/respond", authenticate, async (req, res, next) => {
  try {
    const { status } = req.body; // accepted | blocked
    const f = await db.one(
      "UPDATE friendships SET status=$1 WHERE id=$2 AND receiver=$3 RETURNING *",
      [status, req.params.id, req.user.id]
    );
    res.json(f || { message: "Not found" });
  } catch (err) { next(err); }
});

router.get("/friends", authenticate, async (req, res, next) => {
  try {
    const friends = await db.many(
      `SELECT u.id, u.username, u.full_name, u.avatar_url, u.xp, u.level, u.streak,
              f.id AS friendship_id, f.status, f.created_at
       FROM friendships f
       JOIN users u ON u.id=CASE WHEN f.requester=$1 THEN f.receiver ELSE f.requester END
       WHERE (f.requester=$1 OR f.receiver=$1) AND f.status='accepted'`,
      [req.user.id]
    );
    res.json(friends);
  } catch (err) { next(err); }
});

router.get("/friends/pending", authenticate, async (req, res, next) => {
  try {
    const pending = await db.many(
      `SELECT u.id, u.username, u.avatar_url, f.id AS friendship_id, f.created_at
       FROM friendships f JOIN users u ON u.id=f.requester
       WHERE f.receiver=$1 AND f.status='pending'`,
      [req.user.id]
    );
    res.json(pending);
  } catch (err) { next(err); }
});

// ── Direct Messages ───────────────────────────────────────────────────────────

router.get("/messages", authenticate, async (req, res, next) => {
  try {
    // Conversations list
    const convos = await db.many(
      `SELECT DISTINCT ON (partner_id)
         partner_id, partner_name, partner_avatar, content AS last_message, created_at, read
       FROM (
         SELECT CASE WHEN sender_id=$1 THEN receiver_id ELSE sender_id END AS partner_id,
                CASE WHEN sender_id=$1 THEN r.username ELSE s.username END AS partner_name,
                CASE WHEN sender_id=$1 THEN r.avatar_url ELSE s.avatar_url END AS partner_avatar,
                content, dm.created_at, dm.read
         FROM direct_messages dm
         JOIN users s ON s.id=dm.sender_id
         JOIN users r ON r.id=dm.receiver_id
         WHERE sender_id=$1 OR receiver_id=$1
         ORDER BY created_at DESC
       ) t
       ORDER BY partner_id, created_at DESC`,
      [req.user.id]
    );
    res.json(convos);
  } catch (err) { next(err); }
});

router.get("/messages/:userId", authenticate, async (req, res, next) => {
  try {
    const msgs = await db.many(
      `SELECT * FROM direct_messages
       WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
       ORDER BY created_at ASC LIMIT 100`,
      [req.user.id, req.params.userId]
    );
    await db.query(
      "UPDATE direct_messages SET read=true WHERE receiver_id=$1 AND sender_id=$2",
      [req.user.id, req.params.userId]
    );
    res.json(msgs);
  } catch (err) { next(err); }
});

router.post("/messages", authenticate, async (req, res, next) => {
  try {
    const { receiverId, content } = req.body;
    if (!receiverId || !content?.trim()) return res.status(400).json({ error: "receiverId and content required" });
    const msg = await db.one(
      "INSERT INTO direct_messages (sender_id, receiver_id, content) VALUES ($1,$2,$3) RETURNING *",
      [req.user.id, receiverId, content]
    );
    req.app.get("io").to(`user:${receiverId}`).emit("new_message", { ...msg });
    res.status(201).json(msg);
  } catch (err) { next(err); }
});

// ── Study Groups ──────────────────────────────────────────────────────────────

router.get("/groups", authenticate, async (req, res, next) => {
  try {
    const groups = await db.many(
      `SELECT sg.*, COUNT(gm.user_id)::int AS member_count,
              CASE WHEN gm2.user_id IS NOT NULL THEN true ELSE false END AS is_member
       FROM study_groups sg
       LEFT JOIN group_members gm ON gm.group_id=sg.id
       LEFT JOIN group_members gm2 ON gm2.group_id=sg.id AND gm2.user_id=$1
       WHERE sg.is_public=true OR gm2.user_id IS NOT NULL
       GROUP BY sg.id, gm2.user_id ORDER BY sg.created_at DESC`,
      [req.user.id]
    );
    res.json(groups);
  } catch (err) { next(err); }
});

router.post("/groups", authenticate, async (req, res, next) => {
  try {
    const { name, description, isPublic, school } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const group = await db.transaction(async (client) => {
      const g = await client.query(
        `INSERT INTO study_groups (name, description, is_public, school, creator_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [name, description || null, isPublic ?? true, school || null, req.user.id]
      );
      await client.query(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'owner')",
        [g.rows[0].id, req.user.id]
      );
      return g.rows[0];
    });
    res.status(201).json(group);
  } catch (err) { next(err); }
});

router.post("/groups/:id/join", authenticate, async (req, res, next) => {
  try {
    await db.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user.id]
    );
    res.json({ message: "Joined group" });
  } catch (err) { next(err); }
});

router.delete("/groups/:id/leave", authenticate, async (req, res, next) => {
  try {
    await db.query("DELETE FROM group_members WHERE group_id=$1 AND user_id=$2",
      [req.params.id, req.user.id]);
    res.json({ message: "Left group" });
  } catch (err) { next(err); }
});

// ── Forum ─────────────────────────────────────────────────────────────────────

router.get("/forum", authenticate, async (req, res, next) => {
  try {
    const { topicId } = req.query;
    let q = `
      SELECT fp.*, u.username, u.avatar_url,
             COUNT(replies.id)::int AS reply_count
      FROM forum_posts fp
      JOIN users u ON u.id=fp.user_id
      LEFT JOIN forum_posts replies ON replies.parent_id=fp.id
      WHERE fp.parent_id IS NULL AND fp.is_flagged=false`;
    const p = [];
    if (topicId) q += ` AND fp.topic_id=$${p.push(topicId)}`;
    q += " GROUP BY fp.id, u.username, u.avatar_url ORDER BY fp.created_at DESC LIMIT 50";
    res.json(await db.many(q, p));
  } catch (err) { next(err); }
});

router.get("/forum/:id/replies", authenticate, async (req, res, next) => {
  try {
    const replies = await db.many(
      `SELECT fp.*, u.username, u.avatar_url FROM forum_posts fp
       JOIN users u ON u.id=fp.user_id
       WHERE fp.parent_id=$1 AND fp.is_flagged=false ORDER BY fp.created_at`,
      [req.params.id]
    );
    res.json(replies);
  } catch (err) { next(err); }
});

router.post("/forum", authenticate, async (req, res, next) => {
  try {
    const { topicId, title, content, parentId } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "content required" });
    const post = await db.one(
      `INSERT INTO forum_posts (user_id, topic_id, title, content, parent_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, topicId || null, title || null, content, parentId || null]
    );
    res.status(201).json(post);
  } catch (err) { next(err); }
});

router.post("/forum/:id/upvote", authenticate, async (req, res, next) => {
  try {
    await db.query(
      "INSERT INTO forum_upvotes (post_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [req.params.id, req.user.id]
    );
    await db.query("UPDATE forum_posts SET upvotes=upvotes+1 WHERE id=$1", [req.params.id]);
    res.json({ message: "Upvoted" });
  } catch (err) { next(err); }
});

router.post("/forum/:id/report", authenticate, async (req, res, next) => {
  try {
    await db.query("UPDATE forum_posts SET is_flagged=true WHERE id=$1", [req.params.id]);
    res.json({ message: "Reported. Our team will review it." });
  } catch (err) { next(err); }
});

module.exports = router;
