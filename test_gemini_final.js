const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI("AIzaSyDXAAvK4CYFapl58_ouYFFR25gxI3hil7o");

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("Say hello");
    console.log("Response:", result.response.text());
  } catch (e) {
     if (e.message.includes("403")) {
         console.log("API Key is likely invalid or lacks permissions.");
     } else {
         console.log("Error:", e.message);
     }
  } finally {
    process.exit();
  }
}
test();
