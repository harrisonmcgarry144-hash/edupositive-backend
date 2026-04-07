const router     = require("express").Router();
const multer     = require("multer");
const cloudinary = require("cloudinary").v2;
const db         = require('./index');
const { authenticate } = require('./authmiddleware');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage so we can stream to Cloudinary
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only images and PDFs allowed"));
    }
  },
});

// Upload buffer to Cloudinary
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

// POST /api/upload/handwriting  — OCR + AI feedback
router.post("/handwriting", authenticate, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Upload to Cloudinary to get a URL
    const uploaded = await uploadToCloudinary(req.file.buffer, {
      folder: "edupositive/handwriting",
    });

    // Use Claude's vision to read the handwriting and provide feedback
    const Anthropic = require("@anthropic-ai/sdk");
    const client    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model:      "claude-opus-4-5",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: [
          {
            type:   "image",
            source: { type: "url", url: uploaded.secure_url },
          },
          {
            type: "text",
            text: `This is a student's handwritten notes or answer. Please:
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
}`,
          },
        ],
      }],
    });

    const text = response.content[0].text;
    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, "").trim()); }
    catch { result = { transcription: text, feedback: "Could not parse structured response." }; }

    res.json({ ...result, imageUrl: uploaded.secure_url });
  } catch (err) {
    // Graceful degradation if Cloudinary not configured
    if (err.message?.includes("Must supply") || err.message?.includes("cloud_name")) {
      return res.status(503).json({
        error: "Image upload not configured. Set CLOUDINARY_* environment variables.",
      });
    }
    next(err);
  }
});

module.exports = router;
