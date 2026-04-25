const router = require("express").Router();
const db = require('./index');
const { authenticate } = require('./authmiddleware');
const { hasPremium } = require('./payments');
const Groq = require('groq-sdk');
let groq;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
}

async function requirePremium(req, res, next) {
  const ok = await hasPremium(req.user.id).catch(() => false);
  if (!ok) return res.status(403).json({ error: "Premium required" });
  next();
}

const ACTIVITIES = {
  "Medicine": {
    keywords: ["UKCAT", "BMAT", "UCAT", "work experience hospital", "volunteering NHS", "Medscape", "BMJ", "clinical experience"],
    universities: ["Oxford", "Cambridge", "Imperial", "UCL", "Edinburgh", "Bristol", "Manchester"],
  },
  "Law": {
    keywords: ["mooting", "LNAT", "work experience law firm", "Bar Mock Trial", "debating", "law clinics"],
    universities: ["Oxford", "Cambridge", "LSE", "UCL", "Durham", "Exeter"],
  },
  "Engineering": {
    keywords: ["ENGAA", "EAT", "STEP", "F1 in Schools", "Engineering Education Scheme", "Arkwright Scholarship", "IMechE"],
    universities: ["Cambridge", "Imperial", "Oxford", "Bath", "Southampton", "Bristol"],
  },
  "Computer Science": {
    keywords: ["GCSE Computing", "British Informatics Olympiad", "BEBRAS", "hackathons", "GitHub", "open source"],
    universities: ["Cambridge", "Oxford", "Imperial", "Edinburgh", "UCL", "Warwick"],
  },
  "Mathematics": {
    keywords: ["UKMT", "BMO", "AMC", "STEP", "AEA", "Maths Olympiad", "Further Maths"],
    universities: ["Cambridge", "Oxford", "Imperial", "Warwick", "Edinburgh"],
  },
  "Economics": {
    keywords: ["Bank of England Teen Economist", "Target Oxbridge", "Economics essays", "FT", "Economist"],
    universities: ["Oxford", "Cambridge", "LSE", "UCL", "Warwick", "Bristol"],
  },
  "History": {
    keywords: ["History Olympiad", "archive research", "debating", "essay competitions", "National Archives"],
    universities: ["Oxford", "Cambridge", "Durham", "Edinburgh", "Bristol", "Exeter"],
  },
  "Psychology": {
    keywords: ["British Psychological Society", "cognitive science", "research methodology", "volunteering mental health"],
    universities: ["UCL", "Edinburgh", "Exeter", "Bath", "Birmingham", "Bristol"],
  },
};

// POST /api/supercurricular/generate
router.post("/generate", authenticate, requirePremium, async (req, res, next) => {
  try {
    if (!groq) return res.status(503).json({ error: "AI disabled" });
    const { activity, subjects, careerGoal } = req.body;
    if (!activity) return res.status(400).json({ error: "activity required" });

    const activityData = ACTIVITIES[activity] || {};
    const userSubjects = subjects?.join(', ') || 'A-Level subjects';

    const prompt = `You are a UK university admissions expert and super-curricular advisor. Create a comprehensive, detailed guide for a student who wants to pursue "${activity}" at university.

Student context:
- A-Level subjects: ${userSubjects}
- Career goal: ${careerGoal || activity}
- Studying in the UK

Create an extremely detailed guide with EVERYTHING they need. Be specific, practical, and include real resources with real URLs.

Return ONLY valid JSON:
{
  "overview": "2-3 sentence description of this field and why super-curricular matters for it",
  "timeline": {
    "year12": ["specific action 1", "specific action 2", "specific action 3", "specific action 4"],
    "year13_autumn": ["specific action 1", "specific action 2", "specific action 3"],
    "year13_spring": ["specific action 1", "specific action 2", "specific action 3"]
  },
  "steps": [
    {
      "number": 1,
      "title": "Step title",
      "description": "Detailed description of what to do and why",
      "timeframe": "When to do this",
      "difficulty": "easy|medium|hard",
      "impact": "high|medium|low",
      "actions": ["specific action 1", "specific action 2"],
      "resources": [
        { "name": "Resource name", "url": "https://real-url.com", "type": "book|website|video|course|competition|podcast", "free": true, "description": "What it is and why it helps" }
      ]
    }
  ],
  "competitions": [
    { "name": "Competition name", "url": "https://real-url.com", "deadline": "typical month", "difficulty": "easy|medium|hard", "prestige": "high|medium|low", "description": "What it is", "how_to_prepare": "Specific prep advice" }
  ],
  "workExperience": [
    { "type": "Type of work experience", "where": "Where to find/apply", "how": "How to get it specifically", "when": "When to do it", "what_to_say": "Template opening line for emails/applications" }
  ],
  "reading": [
    { "title": "Book title", "author": "Author name", "why": "Why this is important for applications", "difficulty": "accessible|intermediate|advanced", "isbn": "ISBN if known" }
  ],
  "onlineCourses": [
    { "name": "Course name", "provider": "Coursera/edX/FutureLearn/etc", "url": "https://real-url.com", "duration": "X hours/weeks", "free": true, "why": "Why this helps" }
  ],
  "podcasts": [
    { "name": "Podcast name", "platform": "Spotify/Apple etc", "url": "https://real-url.com", "why": "Why relevant" }
  ],
  "journals": [
    { "name": "Journal/publication name", "url": "https://real-url.com", "why": "Why read this", "free": true }
  ],
  "personalStatement": {
    "keyThemes": ["theme 1", "theme 2", "theme 3"],
    "dos": ["specific do 1", "specific do 2", "specific do 3", "specific do 4"],
    "donts": ["specific dont 1", "specific dont 2", "specific dont 3"],
    "openingIdeas": ["opening idea 1", "opening idea 2", "opening idea 3"],
    "topUniversities": ["Uni 1", "Uni 2", "Uni 3", "Uni 4", "Uni 5"],
    "interviewTopics": ["likely interview topic 1", "likely interview topic 2", "likely interview topic 3"]
  },
  "pastStudentTips": [
    { "tip": "Genuine practical tip from experience", "source": "anonymised source e.g. Medicine student, Oxford 2023" },
    { "tip": "Another tip", "source": "source" },
    { "tip": "Another tip", "source": "source" },
    { "tip": "Another tip", "source": "source" },
    { "tip": "Another tip", "source": "source" }
  ],
  "commonMistakes": ["mistake 1", "mistake 2", "mistake 3", "mistake 4"],
  "uniqueIdeas": ["unusual but impressive activity 1", "unusual but impressive activity 2", "unusual but impressive activity 3"]
}

Make every URL a real, working URL. Include at least 8 steps, 4 competitions, 5 books, 5 online courses. Be extremely specific and practical.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4000,
      messages: [
        { role: "system", content: "You are a UK university admissions expert. Return only valid JSON with real URLs and specific practical advice." },
        { role: "user", content: prompt }
      ],
    });

    const text = completion.choices[0].message.content;
    const cleaned = text.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const guide = JSON.parse(match ? match[0] : cleaned);

    // Cache in DB
    await db.query(
      `INSERT INTO supercurricular_guides (user_id, activity, guide_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, activity) DO UPDATE SET guide_data=$3, updated_at=NOW()`,
      [req.user.id, activity, JSON.stringify(guide)]
    ).catch(() => {});

    res.json(guide);
  } catch(err) { next(err); }
});

// GET /api/supercurricular/saved
router.get("/saved", authenticate, requirePremium, async (req, res, next) => {
  try {
    const guides = await db.many(
      "SELECT activity, updated_at FROM supercurricular_guides WHERE user_id=$1 ORDER BY updated_at DESC",
      [req.user.id]
    ).catch(() => []);
    res.json(guides);
  } catch(err) { next(err); }
});

// GET /api/supercurricular/saved/:activity
router.get("/saved/:activity", authenticate, requirePremium, async (req, res, next) => {
  try {
    const row = await db.one(
      "SELECT guide_data FROM supercurricular_guides WHERE user_id=$1 AND activity=$2",
      [req.user.id, req.params.activity]
    ).catch(() => null);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(JSON.parse(row.guide_data));
  } catch(err) { next(err); }
});

// GET /api/supercurricular/activities
router.get("/activities", authenticate, async (req, res) => {
  const activities = [
    { id: "Medicine", icon: "🩺", desc: "Medical school preparation" },
    { id: "Law", icon: "⚖️", desc: "Law school and Bar preparation" },
    { id: "Engineering", icon: "⚙️", desc: "Engineering and technology" },
    { id: "Computer Science", icon: "💻", desc: "Computing and software" },
    { id: "Mathematics", icon: "∑", desc: "Pure and applied maths" },
    { id: "Economics", icon: "📈", desc: "Economics and finance" },
    { id: "History", icon: "📜", desc: "History and politics" },
    { id: "Psychology", icon: "🧠", desc: "Psychology and neuroscience" },
    { id: "Philosophy", icon: "🤔", desc: "Philosophy and ethics" },
    { id: "Architecture", icon: "🏛️", desc: "Architecture and design" },
    { id: "Biology", icon: "🧬", desc: "Biological sciences" },
    { id: "Chemistry", icon: "⚗️", desc: "Chemistry and biochemistry" },
    { id: "Physics", icon: "⚛️", desc: "Physics and astrophysics" },
    { id: "English Literature", icon: "📚", desc: "English and creative writing" },
    { id: "Politics", icon: "🏛️", desc: "Politics and international relations" },
    { id: "Business", icon: "💼", desc: "Business and management" },
    { id: "Dentistry", icon: "🦷", desc: "Dental school preparation" },
    { id: "Veterinary", icon: "🐾", desc: "Veterinary school preparation" },
    { id: "Pharmacy", icon: "💊", desc: "Pharmacy preparation" },
    { id: "Geography", icon: "🌍", desc: "Geography and environmental science" },
  ];
  res.json(activities);
});

module.exports = router;
