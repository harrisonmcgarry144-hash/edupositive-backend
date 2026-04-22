const router     = require("express").Router();
const multer     = require("multer");
const cloudinary = require("cloudinary").v2;
const db         = require('./index');
const { authenticate } = require('./authmiddleware');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only images and PDFs allowed"));
    }
  },
});

function uploadToCloudinary(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err); else resolve(result);
    });
    stream.end(buffer);
  });
}

// POST /api/upload/avatar
router.post("/avatar", authenticate, upload.single("avatar"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const result = await uploadToCloudinary(req.file.buffer, {
      folder:         "edupositive/avatars",
      public_id:      `user_${req.user.id}`,
      overwrite:      true,
      transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
    });
    await db.query("UPDATE users SET avatar_url=$1 WHERE id=$2", [result.secure_url, req.user.id]);
    res.json({ avatarUrl: result.secure_url });
  } catch (err) { next(err); }
});

// POST /api/upload/handwriting — OCR + AI feedback using Gemini
router.post("/handwriting", authenticate, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const uploaded = await uploadToCloudinary(req.file.buffer, {
      folder: "edupositive/handwriting",
    });

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const prompt = `This is a student's handwritten notes or answer. Please:
1. Transcribe the handwritten text accurately
2. Provide feedback on the content
3. Suggest improvements
4. Extract key points as flashcard candidates

Respond ONLY with valid JSON:
{
  "transcription": "<full transcribed text>",
  "feedback": "<2-3 sentence overall feedback>",
  "improvements": ["<specific improvement>"],
  "keyPoints": ["<point suitable for a flashcard>"],
  "flashcardCandidates": [{ "question": "<q>", "answer": "<a>" }]
}`;

    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } },
      prompt,
    ]);

    const text = result.response.text();
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }
    catch { parsed = { transcription: text, feedback: "Could not parse structured response." }; }

    res.json({ ...parsed, imageUrl: uploaded.secure_url });
  } catch (err) {
    if (err.message?.includes("Must supply") || err.message?.includes("cloud_name")) {
      return res.status(503).json({ error: "Image upload not configured. Set CLOUDINARY_* environment variables." });
    }
    next(err);
  }
});

module.exports = router;
