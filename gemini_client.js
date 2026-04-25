// gemini_client.js - Drop-in AI client using Google Gemini
const { GoogleGenerativeAI } = require('@google/generative-ai');

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY environment variable is not configured');
  return new GoogleGenerativeAI(key);
}

async function callAI(systemPrompt, userPrompt, maxTokens = 2000) {
  const model = getClient().getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    },
  });
  const result = await model.generateContent(userPrompt);
  const blocked = result.response.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini blocked content: ${blocked}`);
  return result.response.text();
}

// For the ai.js chat interface which passes messages array
async function callChat(systemPrompt, messages, maxTokens = 1500) {
  const model = getClient().getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  });

  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : (m.content[0]?.text || '') }],
  }));

  const lastMsg = messages[messages.length - 1];
  const lastText = typeof lastMsg.content === 'string' ? lastMsg.content : (lastMsg.content[0]?.text || '');

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastText);
  const blocked = result.response.promptFeedback?.blockReason;
  if (blocked) throw new Error(`Gemini blocked content: ${blocked}`);
  return result.response.text();
}

module.exports = { callAI, callChat };
