const db = require('./index');

/**
 * Generates a personalised daily study schedule for a user.
 * - Starts light (2 topics/day), ramps up toward exam dates
 * - Weak areas (low memory strength) are prioritised first
 * - Regenerates from today, replacing any existing future entries
 */
async function generateStudySchedule(userId) {
  // Get all upcoming exams
  const exams = await db.many(
    `SELECT ue.*, s.id AS subject_id
     FROM user_exams ue
     LEFT JOIN subjects s ON s.id=ue.subject_id
     WHERE ue.user_id=$1 AND ue.exam_date >= CURRENT_DATE
     ORDER BY ue.exam_date ASC`,
    [userId]
  );
  if (!exams.length) return;

  // Get all subtopics for user's subjects, sorted weakest first
  const subtopics = await db.many(
    `SELECT st.id, st.name, t.subject_id,
            COALESCE(ms.score, 0) AS memory_score
     FROM subtopics st
     JOIN topics t ON t.id=st.topic_id
     JOIN user_subjects us ON us.subject_id=t.subject_id AND us.user_id=$1
     LEFT JOIN memory_strength ms ON ms.subtopic_id=st.id AND ms.user_id=$1
     ORDER BY COALESCE(ms.score, 0) ASC`,
    [userId]
  );
  if (!subtopics.length) return;

  // Clear existing future schedule
  await db.query(
    "DELETE FROM study_schedule WHERE user_id=$1 AND scheduled_date >= CURRENT_DATE",
    [userId]
  );

  const nearestExam  = new Date(exams[0].exam_date);
  const today        = new Date();
  const daysUntil    = Math.max(1, Math.ceil((nearestExam - today) / 86_400_000));
  const totalDays    = Math.min(daysUntil, 90);
  const rows         = [];

  for (let day = 0; day < totalDays; day++) {
    const date      = new Date(today);
    date.setDate(today.getDate() + day);
    const dateStr   = date.toISOString().slice(0, 10);
    const progress  = day / totalDays;

    // Ramp intensity: 2 topics on day 1 → 5 topics close to exam
    const intensity = Math.min(5, Math.round(2 + progress * 3));

    // Rotate through subtopics, looping if needed
    for (let i = 0; i < intensity; i++) {
      const idx     = (day * intensity + i) % subtopics.length;
      const topic   = subtopics[idx];
      const isWeak  = topic.memory_score < 50;
      // Weak topics get 25 min; stronger ones get 20 min
      const mins    = isWeak ? 25 : 20;
      // Priority 10 for weak, 5 for medium, 3 for strong
      const priority = isWeak ? 10 : topic.memory_score < 70 ? 5 : 3;

      rows.push({ userId, subtopicId: topic.id, date: dateStr, mins, priority });
    }
  }

  if (!rows.length) return;

  // Batch insert
  const placeholders = rows.map((_, i) => {
    const base = i * 5;
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`;
  }).join(",");
  const values = rows.flatMap(r => [r.userId, r.subtopicId, r.date, r.mins, r.priority]);

  await db.query(
    `INSERT INTO study_schedule (user_id, subtopic_id, scheduled_date, duration_mins, priority)
     VALUES ${placeholders}`,
    values
  );
}

module.exports = { generateStudySchedule };
