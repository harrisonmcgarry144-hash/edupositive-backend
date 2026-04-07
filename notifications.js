const db    = require('./index');
const email = require("./email");

/**
 * Run every day at 6pm.
 * Sends streak reminders to users who haven't studied today
 * but have an active streak worth protecting.
 */
async function sendDailyStreakReminders() {
  const users = await db.many(
    `SELECT id, email, username, streak
     FROM users
     WHERE notify_streak = true
       AND streak >= 2
       AND (last_active IS NULL OR last_active < CURRENT_DATE)
       AND is_verified = true`,
  );

  let sent = 0;
  for (const user of users) {
    try {
      await email.sendStreakReminderEmail(user.email, user.username, user.streak);
      sent++;
    } catch (e) {
      console.error(`Streak reminder failed for ${user.email}:`, e.message);
    }
  }
  console.log(`[cron] Streak reminders sent: ${sent}/${users.length}`);
}

/**
 * Run once a week.
 * Notifies users about their weakest topics.
 */
async function sendWeakAreaReminders() {
  const users = await db.many(
    `SELECT DISTINCT u.id, u.email, u.username
     FROM users u
     WHERE u.notify_weak = true AND u.is_verified = true
       AND EXISTS (SELECT 1 FROM memory_strength ms WHERE ms.user_id=u.id AND ms.score < 50)`
  );

  for (const user of users) {
    try {
      const weak = await db.many(
        `SELECT st.name FROM memory_strength ms
         JOIN subtopics st ON st.id=ms.subtopic_id
         WHERE ms.user_id=$1 AND ms.score < 50
         ORDER BY ms.score ASC LIMIT 3`,
        [user.id]
      );
      if (weak.length) {
        await email.sendWeakAreaEmail(user.email, user.username, weak.map(w => w.name));
      }
    } catch (e) {
      console.error(`Weak area email failed for ${user.email}:`, e.message);
    }
  }
}

/**
 * Run every morning.
 * Warns users about upcoming exams (7 days, 3 days, 1 day before).
 */
async function sendExamCountdownReminders() {
  const targetDays = [7, 3, 1];
  for (const days of targetDays) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const dateStr = targetDate.toISOString().slice(0, 10);

    const upcoming = await db.many(
      `SELECT ue.paper_name, u.email, u.username
       FROM user_exams ue
       JOIN users u ON u.id=ue.user_id
       WHERE ue.exam_date=$1 AND u.is_verified=true`,
      [dateStr]
    );
    for (const row of upcoming) {
      try {
        await email.sendExamCountdownEmail(
          row.email, row.username,
          row.paper_name || "Your exam", days
        );
      } catch (e) {
        console.error(`Exam countdown email failed for ${row.email}:`, e.message);
      }
    }
  }
}

/**
 * Save a notification to DB and push via socket if io is provided.
 */
async function createNotification(userId, type, title, body, data = {}, io = null) {
  const notif = await db.one(
    "INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [userId, type, title, body, JSON.stringify(data)]
  );
  if (io) {
    io.to(`user:${userId}`).emit("notification", notif);
  }
  return notif;
}

module.exports = {
  sendDailyStreakReminders,
  sendWeakAreaReminders,
  sendExamCountdownReminders,
  createNotification,
};
