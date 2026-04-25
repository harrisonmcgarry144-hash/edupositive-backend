const db = require('./index');
const email = require('./email');

// Short motivational revision messages
const MESSAGES = [
  { subject: "Your daily revision starts now ✦", tip: "The best time to revise is when you don't feel like it. Open one topic, read for 10 minutes, and the momentum will follow." },
  { subject: "Small sessions, big results ✦", tip: "Research shows that 3 short revision sessions beat one long cram. Even 20 minutes today will compound over time." },
  { subject: "Your exams are closer than they feel ✦", tip: "Every subtopic you master now is one less thing to panic about in May. Pick your weakest topic today and give it 30 minutes." },
  { subject: "The secret to A* grades ✦", tip: "Top students don't study harder — they study smarter. Use the blurt technique: close your notes and write everything you remember." },
  { subject: "One lesson today ✦", tip: "You don't need a perfect revision plan. You just need to open the app and start. One lesson. That's it." },
  { subject: "Your future self will thank you ✦", tip: "The results you get in summer depend on the choices you make today. Make the revision session happen." },
  { subject: "Flashcards are waiting for you ✦", tip: "Spaced repetition is the most evidence-backed revision technique. Your flashcards are scheduled — trust the system." },
  { subject: "Past papers are your best friend ✦", tip: "Examiners reward students who practise under exam conditions. Do one past paper question today, time yourself, then check the mark scheme." },
  { subject: "Review before you sleep ✦", tip: "Your brain consolidates memory during sleep. Reading your notes before bed — even briefly — significantly improves retention." },
  { subject: "Progress over perfection ✦", tip: "You don't need to understand everything perfectly before moving on. Revisit tricky topics after you've seen the bigger picture." },
  { subject: "Active recall beats re-reading ✦", tip: "Highlighting and re-reading feel productive but don't work. Test yourself instead — it's harder but far more effective." },
  { subject: "Make the connection ✦", tip: "The best A-Level answers link ideas across topics. As you revise today, ask yourself: how does this connect to something I already know?" },
  { subject: "You've already started ✦", tip: "Getting started is the hardest part. You've already opened this email — now open EduPositive and do five minutes. Five minutes is enough." },
  { subject: "Exam technique matters as much as knowledge ✦", tip: "Knowing the content isn't enough. Practise writing answers that use command words correctly, show your working, and hit every mark point." },
];

async function sendDailyRevisionEmails() {
  console.log("[DailyEmail] Starting daily revision email send...");

  try {
    // Get all verified users who haven't opted out
    const users = await db.manyOrNone(
      `SELECT id, email, username, full_name, streak, xp, level
       FROM users
       WHERE is_verified = true
       ORDER BY created_at`
    );

    console.log(`[DailyEmail] Sending to ${users.length} users`);

    // Pick a random message for today (same for everyone)
    const msg = MESSAGES[new Date().getDay() % MESSAGES.length];

    let sent = 0;
    for (const user of users) {
      try {
        await email.sendDailyRevisionEmail(user.email, user.username || user.full_name, msg, user.streak);
        sent++;
        // Small delay to avoid Gmail rate limits
        await new Promise(r => setTimeout(r, 100));
      } catch(e) {
        console.error(`[DailyEmail] Failed for ${user.email}:`, e.message);
      }
    }

    console.log(`[DailyEmail] Done — sent ${sent}/${users.length} emails`);
  } catch(e) {
    console.error("[DailyEmail] Error:", e.message);
  }
}

module.exports = { sendDailyRevisionEmails };
