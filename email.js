const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || "smtp.gmail.com",
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const BASE = process.env.CLIENT_URL || "http://localhost:3000";
const FROM = `"EduPositive ✦" <${process.env.SMTP_USER}>`;

const layout = (body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,'Helvetica Neue',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#12121a;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6c63ff,#a78bfa);padding:28px 32px;">
      <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.02em;">✦ EduPositive</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;">Learn deeper. Remember longer.</div>
    </div>
    <div style="padding:32px;">${body}</div>
    <div style="padding:20px 32px;border-top:1px solid #2a2a3a;font-size:12px;color:#4a4a6a;">
      © EduPositive · You received this because you have an account with us.
    </div>
  </div>
</body>
</html>`;

const btn = (text, url) =>
  `<a href="${url}" style="display:inline-block;background:#6c63ff;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-top:8px;">${text}</a>`;

const h1 = (t) =>
  `<h1 style="font-size:22px;font-weight:800;color:#f0f0f8;margin:0 0 8px;letter-spacing:-0.02em;">${t}</h1>`;

const p = (t) =>
  `<p style="font-size:14px;color:#8888aa;line-height:1.6;margin:0 0 20px;">${t}</p>`;

const note = (t) =>
  `<p style="font-size:12px;color:#4a4a6a;margin-top:24px;">${t}</p>`;

// ── Verification ──────────────────────────────────────────────────────────────
async function sendVerificationEmail(toEmail, token) {
  const url  = `${BASE}/verify/${token}`;
  const html = layout(`
    ${h1("Verify your email")}
    ${p("Welcome to EduPositive! Click below to verify your email address and start your learning journey.")}
    ${btn("Verify Email →", url)}
    ${note("This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.")}
  `);
  await transporter.sendMail({ from: FROM, to: toEmail, subject: "Verify your EduPositive account", html });
}

// ── Password reset ────────────────────────────────────────────────────────────
async function sendPasswordResetEmail(toEmail, token) {
  const url  = `${BASE}/reset-password/${token}`;
  const html = layout(`
    ${h1("Reset your password")}
    ${p("We received a request to reset your password. Click the button below to choose a new one.")}
    ${btn("Reset Password →", url)}
    ${note("This link expires in 1 hour. If you didn't request this, your account is safe — just ignore this email.")}
  `);
  await transporter.sendMail({ from: FROM, to: toEmail, subject: "Reset your EduPositive password", html });
}

// ── Streak reminder ───────────────────────────────────────────────────────────
async function sendStreakReminderEmail(toEmail, username, streak) {
  const html = layout(`
    <div style="font-size:40px;margin-bottom:16px;">🔥</div>
    ${h1(`Don't break your ${streak}-day streak!`)}
    ${p(`Hey ${username}, you haven't studied today yet. Log in and keep your streak alive — even 10 minutes counts.`)}
    ${btn("Study Now →", BASE)}
    ${note("You can turn off these reminders in Settings → Notifications.")}
  `);
  await transporter.sendMail({
    from: FROM, to: toEmail,
    subject: `🔥 ${streak}-day streak at risk, ${username}!`,
    html,
  });
}

// ── Weak area nudge ───────────────────────────────────────────────────────────
async function sendWeakAreaEmail(toEmail, username, topics) {
  const list = topics.map(t => `<li style="color:#f0f0f8;margin-bottom:6px;">${t}</li>`).join("");
  const html = layout(`
    ${h1("Topics that need attention")}
    ${p(`Hey ${username}, our AI has spotted some areas that could use a bit more work:`)}
    <ul style="padding-left:20px;margin:0 0 20px;">${list}</ul>
    ${p("A short focused session now can make a big difference before your exams.")}
    ${btn("Start Revising →", BASE)}
    ${note("You can turn off these nudges in Settings → Notifications.")}
  `);
  await transporter.sendMail({ from: FROM, to: toEmail, subject: `${username}, these topics need your attention`, html });
}

// ── Exam countdown ────────────────────────────────────────────────────────────
async function sendExamCountdownEmail(toEmail, username, examName, daysUntil) {
  const urgency = daysUntil <= 3 ? "🚨" : daysUntil <= 7 ? "⚠️" : "📅";
  const html = layout(`
    <div style="font-size:40px;margin-bottom:16px;">${urgency}</div>
    ${h1(`${examName} is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`)}
    ${p(`Hey ${username}, your exam is coming up fast. Make sure you're on top of all the key topics and have reviewed your weak areas.`)}
    ${btn("View Study Plan →", `${BASE}/schedule`)}
    ${note("Good luck — you've got this! ✦")}
  `);
  await transporter.sendMail({
    from: FROM, to: toEmail,
    subject: `${urgency} ${examName} is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
    html,
  });
}
async function sendVerificationCode(toEmail, username, code) {
  const html = layout(`
    ${h1("Verify your email")}
    ${p(`Hey ${username}! Welcome to EduPositive. Enter this code to verify your account:`)}
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:#1a1a2e;border:2px solid #6c63ff;border-radius:16px;padding:20px 40px;">
        <div style="font-size:48px;font-weight:900;color:#6c63ff;letter-spacing:12px;font-family:monospace;">${code}</div>
      </div>
    </div>
    ${p("This code expires in 15 minutes.")}
  `);
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: `${code} is your EduPositive verification code`,
    html,
  });
}
module.exports = {
  sendVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStreakReminderEmail,
  sendWeakAreaEmail,
  sendExamCountdownEmail,
};
