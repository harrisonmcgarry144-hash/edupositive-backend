require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = {
  query: (text, params) => pool.query(text, params),
  one: async (text, params) => { const { rows } = await pool.query(text, params); return rows[0] || null; },
  many: async (text, params) => { const { rows } = await pool.query(text, params); return rows; },
};

// ── All past papers by subject ────────────────────────────────────────────────
// Years: 2017 (new spec start) → 2023 (most recent)
// 2020 excluded (no exams due to COVID)
// 2021 excluded (teacher assessed grades)

const EXAM_YEARS = [2017, 2018, 2019, 2022, 2023];

const PAPERS = [
  // ── AQA Biology ──────────────────────────────────────────────────────────────
  {
    subject: "biology",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Biology A-Level Paper 1 (${year})`, marks: 91, mins: 120 },
      { year, paper: 2, title: `AQA Biology A-Level Paper 2 (${year})`, marks: 91, mins: 120 },
      { year, paper: 3, title: `AQA Biology A-Level Paper 3 (${year})`, marks: 78, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 61, B: 52, C: 44, D: 36, E: 28 },
      2022: { A: 55, B: 46, C: 38, D: 30, E: 22 },
      2019: { A: 65, B: 56, C: 47, D: 38, E: 30 },
      2018: { A: 63, B: 54, C: 45, D: 37, E: 29 },
      2017: { A: 60, B: 51, C: 43, D: 35, E: 27 },
    },
  },

  // ── AQA Chemistry ────────────────────────────────────────────────────────────
  {
    subject: "chemistry",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Chemistry A-Level Paper 1 (${year})`, marks: 105, mins: 120 },
      { year, paper: 2, title: `AQA Chemistry A-Level Paper 2 (${year})`, marks: 105, mins: 120 },
      { year, paper: 3, title: `AQA Chemistry A-Level Paper 3 (${year})`, marks: 90, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 70, B: 60, C: 51, D: 42, E: 33 },
      2022: { A: 65, B: 55, C: 46, D: 37, E: 28 },
      2019: { A: 72, B: 62, C: 52, D: 43, E: 34 },
      2018: { A: 68, B: 58, C: 49, D: 40, E: 31 },
      2017: { A: 66, B: 56, C: 47, D: 38, E: 29 },
    },
  },

  // ── Edexcel Mathematics ───────────────────────────────────────────────────────
  {
    subject: "mathematics",
    board: "Edexcel",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `Edexcel Maths A-Level Paper 1: Pure (${year})`, marks: 100, mins: 120 },
      { year, paper: 2, title: `Edexcel Maths A-Level Paper 2: Pure (${year})`, marks: 100, mins: 120 },
      { year, paper: 3, title: `Edexcel Maths A-Level Paper 3: Statistics & Mechanics (${year})`, marks: 100, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 57, B: 50, C: 43, D: 36, E: 29 },
      2022: { A: 52, B: 45, C: 38, D: 31, E: 24 },
      2019: { A: 62, B: 54, C: 46, D: 38, E: 30 },
      2018: { A: 58, B: 50, C: 43, D: 36, E: 29 },
      2017: { A: 55, B: 48, C: 41, D: 34, E: 27 },
    },
  },

  // ── Edexcel Further Mathematics ───────────────────────────────────────────────
  {
    subject: "further-mathematics",
    board: "Edexcel",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `Edexcel Further Maths A-Level Paper 1: Core Pure 1 (${year})`, marks: 75, mins: 90 },
      { year, paper: 2, title: `Edexcel Further Maths A-Level Paper 2: Core Pure 2 (${year})`, marks: 75, mins: 90 },
      { year, paper: 3, title: `Edexcel Further Maths A-Level Paper 3: Further Options (${year})`, marks: 75, mins: 90 },
      { year, paper: 4, title: `Edexcel Further Maths A-Level Paper 4: Further Options (${year})`, marks: 75, mins: 90 },
    ]),
    boundaries: {
      2023: { A: 50, B: 43, C: 36, D: 29, E: 22 },
      2022: { A: 48, B: 41, C: 34, D: 27, E: 21 },
      2019: { A: 55, B: 47, C: 39, D: 32, E: 25 },
      2018: { A: 52, B: 44, C: 37, D: 30, E: 23 },
      2017: { A: 50, B: 43, C: 36, D: 29, E: 22 },
    },
  },

  // ── AQA Physics ──────────────────────────────────────────────────────────────
  {
    subject: "physics",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Physics A-Level Paper 1 (${year})`, marks: 85, mins: 120 },
      { year, paper: 2, title: `AQA Physics A-Level Paper 2 (${year})`, marks: 85, mins: 120 },
      { year, paper: 3, title: `AQA Physics A-Level Paper 3 (${year})`, marks: 80, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 55, B: 47, C: 39, D: 31, E: 24 },
      2022: { A: 50, B: 43, C: 36, D: 29, E: 22 },
      2019: { A: 60, B: 51, C: 43, D: 35, E: 27 },
      2018: { A: 57, B: 49, C: 41, D: 33, E: 25 },
      2017: { A: 55, B: 47, C: 39, D: 32, E: 25 },
    },
  },

  // ── Edexcel English Literature ────────────────────────────────────────────────
  {
    subject: "english-literature",
    board: "Edexcel",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `Edexcel English Literature Paper 1: Drama (${year})`, marks: 60, mins: 150 },
      { year, paper: 2, title: `Edexcel English Literature Paper 2: Prose (${year})`, marks: 60, mins: 150 },
      { year, paper: 3, title: `Edexcel English Literature Paper 3: Poetry (${year})`, marks: 40, mins: 75 },
    ]),
    boundaries: {
      2023: { A: 108, B: 96, C: 84, D: 72, E: 60 },
      2022: { A: 100, B: 89, C: 78, D: 67, E: 56 },
      2019: { A: 112, B: 99, C: 87, D: 75, E: 63 },
      2018: { A: 108, B: 96, C: 84, D: 72, E: 60 },
      2017: { A: 105, B: 93, C: 82, D: 71, E: 60 },
    },
  },

  // ── Edexcel English Language ──────────────────────────────────────────────────
  {
    subject: "english-language",
    board: "Edexcel",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `Edexcel English Language Paper 1: Language in Action (${year})`, marks: 60, mins: 150 },
      { year, paper: 2, title: `Edexcel English Language Paper 2: Representations in Language (${year})`, marks: 60, mins: 150 },
    ]),
    boundaries: {
      2023: { A: 88, B: 78, C: 68, D: 58, E: 48 },
      2022: { A: 82, B: 72, C: 63, D: 54, E: 45 },
      2019: { A: 90, B: 80, C: 70, D: 60, E: 50 },
      2018: { A: 87, B: 77, C: 67, D: 57, E: 47 },
      2017: { A: 85, B: 75, C: 65, D: 55, E: 46 },
    },
  },

  // ── Edexcel History ───────────────────────────────────────────────────────────
  {
    subject: "history",
    board: "Edexcel",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `Edexcel History Paper 1: Breadth Study (${year})`, marks: 60, mins: 105 },
      { year, paper: 2, title: `Edexcel History Paper 2: Depth Study (${year})`, marks: 60, mins: 105 },
      { year, paper: 3, title: `Edexcel History Paper 3: Themes & Interpretations (${year})`, marks: 60, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 126, B: 112, C: 98, D: 84, E: 70 },
      2022: { A: 118, B: 105, C: 92, D: 79, E: 66 },
      2019: { A: 130, B: 115, C: 100, D: 86, E: 72 },
      2018: { A: 126, B: 112, C: 98, D: 84, E: 70 },
      2017: { A: 122, B: 108, C: 95, D: 82, E: 69 },
    },
  },

  // ── AQA Philosophy ───────────────────────────────────────────────────────────
  {
    subject: "philosophy",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Philosophy Paper 1: Epistemology & Moral Philosophy (${year})`, marks: 100, mins: 180 },
      { year, paper: 2, title: `AQA Philosophy Paper 2: Metaphysics & Philosophy of Mind/Religion (${year})`, marks: 100, mins: 180 },
    ]),
    boundaries: {
      2023: { A: 130, B: 115, C: 100, D: 86, E: 72 },
      2022: { A: 122, B: 108, C: 94, D: 80, E: 66 },
      2019: { A: 135, B: 119, C: 104, D: 89, E: 74 },
      2018: { A: 130, B: 115, C: 100, D: 86, E: 72 },
      2017: { A: 126, B: 112, C: 98, D: 84, E: 70 },
    },
  },

  // ── OCR Law ───────────────────────────────────────────────────────────────────
  {
    subject: "law",
    board: "OCR",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `OCR Law Component 1: The Legal System & Criminal Law (${year})`, marks: 100, mins: 150 },
      { year, paper: 2, title: `OCR Law Component 2: Law Making & The Law of Tort (${year})`, marks: 100, mins: 150 },
      { year, paper: 3, title: `OCR Law Component 3: Further Law (${year})`, marks: 60, mins: 90 },
    ]),
    boundaries: {
      2023: { A: 185, B: 164, C: 143, D: 122, E: 102 },
      2022: { A: 174, B: 154, C: 135, D: 116, E: 97 },
      2019: { A: 192, B: 170, C: 148, D: 127, E: 106 },
      2018: { A: 186, B: 165, C: 144, D: 123, E: 102 },
      2017: { A: 180, B: 160, C: 140, D: 120, E: 100 },
    },
  },

  // ── AQA Psychology ───────────────────────────────────────────────────────────
  {
    subject: "psychology",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Psychology Paper 1: Introductory Topics (${year})`, marks: 96, mins: 120 },
      { year, paper: 2, title: `AQA Psychology Paper 2: Psychology in Context (${year})`, marks: 96, mins: 120 },
      { year, paper: 3, title: `AQA Psychology Paper 3: Issues & Options (${year})`, marks: 96, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 175, B: 155, C: 136, D: 117, E: 98 },
      2022: { A: 165, B: 146, C: 128, D: 110, E: 92 },
      2019: { A: 182, B: 161, C: 141, D: 121, E: 101 },
      2018: { A: 176, B: 156, C: 136, D: 117, E: 98 },
      2017: { A: 170, B: 151, C: 132, D: 113, E: 94 },
    },
  },

  // ── AQA Sociology ────────────────────────────────────────────────────────────
  {
    subject: "sociology",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Sociology Paper 1: Education with Theory & Methods (${year})`, marks: 80, mins: 120 },
      { year, paper: 2, title: `AQA Sociology Paper 2: Topics in Sociology (${year})`, marks: 80, mins: 120 },
      { year, paper: 3, title: `AQA Sociology Paper 3: Crime & Deviance with Theory & Methods (${year})`, marks: 80, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 152, B: 135, C: 118, D: 101, E: 84 },
      2022: { A: 143, B: 127, C: 111, D: 95, E: 79 },
      2019: { A: 158, B: 140, C: 122, D: 105, E: 88 },
      2018: { A: 153, B: 136, C: 119, D: 102, E: 85 },
      2017: { A: 148, B: 132, C: 116, D: 100, E: 84 },
    },
  },

  // ── AQA Economics ────────────────────────────────────────────────────────────
  {
    subject: "economics",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Economics Paper 1: Markets & Market Failure (${year})`, marks: 80, mins: 120 },
      { year, paper: 2, title: `AQA Economics Paper 2: National & International Economy (${year})`, marks: 80, mins: 120 },
      { year, paper: 3, title: `AQA Economics Paper 3: Economic Principles & Issues (${year})`, marks: 80, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 148, B: 131, C: 115, D: 99, E: 83 },
      2022: { A: 140, B: 124, C: 108, D: 93, E: 78 },
      2019: { A: 154, B: 136, C: 119, D: 102, E: 85 },
      2018: { A: 149, B: 132, C: 115, D: 99, E: 83 },
      2017: { A: 144, B: 128, C: 112, D: 96, E: 80 },
    },
  },

  // ── AQA Business Studies ──────────────────────────────────────────────────────
  {
    subject: "business-studies",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Business Studies Paper 1: Business 1 (${year})`, marks: 100, mins: 120 },
      { year, paper: 2, title: `AQA Business Studies Paper 2: Business 2 (${year})`, marks: 100, mins: 120 },
      { year, paper: 3, title: `AQA Business Studies Paper 3: Business 3 (${year})`, marks: 100, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 185, B: 164, C: 143, D: 122, E: 101 },
      2022: { A: 174, B: 154, C: 135, D: 116, E: 97 },
      2019: { A: 190, B: 168, C: 147, D: 126, E: 105 },
      2018: { A: 185, B: 164, C: 143, D: 122, E: 101 },
      2017: { A: 179, B: 159, C: 139, D: 119, E: 99 },
    },
  },

  // ── Edexcel Politics ─────────────────────────────────────────────────────────
  {
    subject: "politics",
    board: "Edexcel",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `Edexcel Politics Paper 1: UK Politics (${year})`, marks: 84, mins: 120 },
      { year, paper: 2, title: `Edexcel Politics Paper 2: UK Government (${year})`, marks: 84, mins: 120 },
      { year, paper: 3, title: `Edexcel Politics Paper 3: Comparative Politics (${year})`, marks: 84, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 155, B: 137, C: 120, D: 103, E: 86 },
      2022: { A: 146, B: 129, C: 113, D: 97, E: 81 },
      2019: { A: 161, B: 142, C: 124, D: 106, E: 88 },
      2018: { A: 156, B: 138, C: 120, D: 103, E: 86 },
      2017: { A: 150, B: 133, C: 116, D: 99, E: 82 },
    },
  },

  // ── AQA Geography ────────────────────────────────────────────────────────────
  {
    subject: "geography",
    board: "AQA",
    papers: EXAM_YEARS.flatMap(year => [
      { year, paper: 1, title: `AQA Geography Paper 1: Physical Geography (${year})`, marks: 120, mins: 150 },
      { year, paper: 2, title: `AQA Geography Paper 2: Human Geography (${year})`, marks: 120, mins: 150 },
      { year, paper: 3, title: `AQA Geography Paper 3: Geographical Fieldwork Inquiry (${year})`, marks: 60, mins: 120 },
    ]),
    boundaries: {
      2023: { A: 198, B: 176, C: 154, D: 132, E: 110 },
      2022: { A: 186, B: 165, C: 144, D: 123, E: 102 },
      2019: { A: 206, B: 182, C: 159, D: 136, E: 113 },
      2018: { A: 199, B: 176, C: 154, D: 132, E: 110 },
      2017: { A: 192, B: 170, C: 149, D: 128, E: 107 },
    },
  },
];

async function seedExams() {
  console.log("📝 Seeding exam papers...\n");

  const admin = await db.one("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!admin) { console.error("❌ No admin user found."); process.exit(1); }

  // Get or create exam boards
  const boardIds = {};
  for (const boardName of ["AQA", "Edexcel", "OCR", "WJEC", "CIE"]) {
    const existing = await db.one("SELECT id FROM exam_boards WHERE name=$1", [boardName]);
    if (existing) {
      boardIds[boardName] = existing.id;
    } else {
      const b = await db.one("INSERT INTO exam_boards (name) VALUES ($1) RETURNING id", [boardName]);
      boardIds[boardName] = b.id;
    }
  }
  console.log("✓ Exam boards ready\n");

  let totalPapers = 0;

  for (const subjectData of PAPERS) {
    // Find subject
    const subject = await db.one("SELECT id, name FROM subjects WHERE slug=$1", [subjectData.subject]);
    if (!subject) { console.log(`⚠ Subject not found: ${subjectData.subject}`); continue; }

    const boardId = boardIds[subjectData.board];
    console.log(`📚 ${subject.name} (${subjectData.board}) — ${subjectData.papers.length} papers`);

    for (const paper of subjectData.papers) {
      // Check if already exists
      const existing = await db.one(
        "SELECT id FROM past_papers WHERE subject_id=$1 AND year=$2 AND paper_number=$3",
        [subject.id, paper.year, paper.paper]
      );
      if (existing) continue;

      // Create paper
      const pp = await db.one(
        `INSERT INTO past_papers (subject_id, exam_board_id, year, paper_number, title, total_marks, duration_mins, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [subject.id, boardId, paper.year, paper.paper, paper.title, paper.marks, paper.mins, admin.id]
      );

      // Add grade boundaries for this paper if available
      const yearBounds = subjectData.boundaries?.[paper.year];
      if (yearBounds && paper.paper === 1) {
        // Only add boundaries to paper 1 (they represent whole qualification)
        for (const [grade, minMark] of Object.entries(yearBounds)) {
          await db.query(
            "INSERT INTO grade_boundaries (paper_id, grade, min_marks, max_marks) VALUES ($1,$2,$3,$4)",
            [pp.id, grade, minMark, minMark + 10]
          );
        }
      }
      totalPapers++;
    }
    console.log(`  ✓ Done\n`);
  }

  console.log(`✅ Exam seeding complete! ${totalPapers} papers added.`);
  process.exit(0);
}

seedExams().catch(e => { console.error("❌ Failed:", e.message); process.exit(1); });
