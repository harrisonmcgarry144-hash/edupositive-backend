const { Resend } = require('resend');
let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('[Email] RESEND_API_KEY missing. Email features will be disabled.');
}

const BASE = process.env.CLIENT_URL || "http://localhost:3000";
const FROM = "EduPositive <noreply@edupositive.xyz>";

const layout = (body) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,'Helvetica Neue',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#12121a;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#6c63ff,#a78bfa);padding:28px 32px;">
      <div style="font-size:28px;font-weight:800;color:#fff;letter-spacing:-0.02em;">&#10022; EduPositive</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:4px;">Learn deeper. Remember longer.</div>
    </div>
    <div style="padding:32px;">${body}</div>
    <div style="padding:20px 32px;border-top:1px solid #2a2a3a;font-size:12px;color:#4a4a6a;">
      &copy; EduPositive &middot; You received this because you have an account with us.
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

async function send(to, subject, html) {
  try {
    if (!resend) {
      console.log(`[Email] Mock send to ${to}: ${subject}`);
      return;
    }
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch(e) {
    console.error("Email failed:", e.message);
  }
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
    ${note("If you didn't create an account, you can safely ignore this email.")}
  `);
  await send(toEmail, `${code} is your EduPositive verification code`, html);
}

async function sendVerificationEmail(toEmail, token) {
  const url = `${BASE}/verify/${token}`;
  const html = layout(`
    ${h1("Verify your email")}
    ${p("Welcome to EduPositive! Click below to verify your email address.")}
    ${btn("Verify Email &rarr;", url)}
    ${note("This link expires in 24 hours.")}
  `);
  await send(toEmail, "Verify your EduPositive account", html);
}

async function sendPasswordResetEmail(toEmail, token) {
  const url = `${BASE}/reset-password/${token}`;
  const html = layout(`
    ${h1("Reset your password")}
    ${p("We received a request to reset your password. Click the button below to choose a new one.")}
    ${btn("Reset Password &rarr;", url)}
    ${note("This link expires in 1 hour. If you didn't request this, your account is safe.")}
  `);
  await send(toEmail, "Reset your EduPositive password", html);
}

async function sendDailyRevisionEmail(toEmail, username, msg, streak) {
  const streakText = streak > 1
    ? `<div style="text-align:center;margin-bottom:20px;"><span style="background:#1a1a2e;border:1px solid #f59e0b;border-radius:100px;padding:6px 16px;font-size:13px;color:#f59e0b;font-weight:700;">${streak} day streak &#128293; Keep it going!</span></div>`
    : "";
  const html = layout(`
    ${h1(msg.subject)}
    ${streakText}
    ${p(msg.tip)}
    ${btn("Start Revising &rarr;", BASE)}
    ${note("You're receiving this because you have an EduPositive account.")}
  `);
  await send(toEmail, msg.subject, html);
}

async function sendStreakReminderEmail(toEmail, username, streak) {
  const html = layout(`
    <div style="font-size:40px;margin-bottom:16px;">&#128293;</div>
    ${h1(`Don't break your ${streak}-day streak!`)}
    ${p(`Hey ${username}, you haven't studied today yet. Log in and keep your streak alive.`)}
    ${btn("Study Now &rarr;", BASE)}
  `);
  await send(toEmail, `&#128293; ${streak}-day streak at risk, ${username}!`, html);
}

async function sendWeakAreaEmail(toEmail, username, topics) {
  const list = topics.map(t => `<li style="color:#f0f0f8;margin-bottom:6px;">${t}</li>`).join("");
  const html = layout(`
    ${h1("Topics that need attention")}
    ${p(`Hey ${username}, our AI has spotted some areas that could use more work:`)}
    <ul style="padding-left:20px;margin:0 0 20px;">${list}</ul>
    ${btn("Start Revising &rarr;", BASE)}
  `);
  await send(toEmail, `${username}, these topics need your attention`, html);
}

async function sendExamCountdownEmail(toEmail, username, examName, daysUntil) {
  const html = layout(`
    ${h1(`${examName} is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`)}
    ${p(`Hey ${username}, your exam is coming up fast. Make sure you're on top of all the key topics.`)}
    ${btn("View Study Plan &rarr;", `${BASE}/schedule`)}
  `);
  await send(toEmail, `${examName} is in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`, html);
}

module.exports = {
  sendVerificationCode,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendDailyRevisionEmail,
  sendStreakReminderEmail,
  sendWeakAreaEmail,
  sendExamCountdownEmail,
};
