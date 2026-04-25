// groq_client.js - Drop-in replacement for Anthropic client using Groq
const Groq = require('groq-sdk');

let groq;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function callAI(systemPrompt, userPrompt, maxTokens = 2000) {
  if (!groq) throw new Error("Groq AI not configured");
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
  });
  return response.choices[0].message.content;
}

module.exports = { callAI };
