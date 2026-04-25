require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = {
  query: (text, params) => pool.query(text, params),
  one: async (text, params) => { const { rows } = await pool.query(text, params); return rows[0] || null; },
};

async function seedFurtherMaths() {
  console.log("📐 Reseeding Further Mathematics...\n");

  const admin = await db.one("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!admin) { console.error("❌ No admin found"); process.exit(1); }

  // Delete old Further Mathematics subject and recreate properly
  const existing = await db.one("SELECT id FROM subjects WHERE slug='further-mathematics'");
  if (existing) {
    console.log("Removing old Further Mathematics...");
    await db.query("DELETE FROM past_papers WHERE subject_id=$1", [existing.id]);
    await db.query("DELETE FROM topics WHERE subject_id=$1", [existing.id]);
    await db.query("DELETE FROM subjects WHERE id=$1", [existing.id]);
  }

  // Create AS Further Mathematics
  const asFm = await db.one(
    `INSERT INTO subjects (name, slug, icon, color, level_type, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    ["Further Mathematics (AS)", "further-mathematics-as", "∞", "#8b5cf6", "a-level",
     "AS Further Mathematics (Edexcel)", admin.id]
  );

  const asTopics = [
    {
      name: "Core Pure Mathematics (AS)",
      subtopics: ["Complex Numbers", "Matrices", "Further Algebra & Functions", "Further Calculus", "Further Vectors", "Polar Coordinates", "Proof by Induction"],
    },
    {
      name: "Further Statistics 1 (Option)",
      subtopics: ["Discrete Probability Distributions", "Poisson Distribution", "Geometric & Negative Binomial", "Hypothesis Testing", "Central Limit Theorem"],
    },
    {
      name: "Further Mechanics 1 (Option)",
      subtopics: ["Momentum & Impulse", "Work, Energy & Power", "Elastic Strings & Springs", "Elastic Collisions in 1D", "Elastic Collisions in 2D"],
    },
    {
      name: "Decision Mathematics 1 (Option)",
      subtopics: ["Algorithms", "Graph Theory", "Algorithms on Graphs", "Critical Path Analysis", "Linear Programming"],
    },
  ];

  for (let ti = 0; ti < asTopics.length; ti++) {
    const topic = asTopics[ti];
    const t = await db.one(
      "INSERT INTO topics (subject_id, name, slug, order_index, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [asFm.id, topic.name, topic.name.toLowerCase().replace(/[^a-z0-9]+/g,"-"), ti, admin.id]
    );
    for (let si = 0; si < topic.subtopics.length; si++) {
      const stName = topic.subtopics[si];
      await db.query(
        "INSERT INTO subtopics (topic_id, name, slug, order_index, created_by) VALUES ($1,$2,$3,$4,$5)",
        [t.id, stName, stName.toLowerCase().replace(/[^a-z0-9]+/g,"-"), si, admin.id]
      );
    }
  }
  console.log("✓ AS Further Mathematics created");

  // Create A-Level Further Mathematics
  const aLevelFm = await db.one(
    `INSERT INTO subjects (name, slug, icon, color, level_type, description, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    ["Further Mathematics (A-Level)", "further-mathematics-alevel", "∞", "#6d28d9", "a-level",
     "A-Level Further Mathematics (Edexcel)", admin.id]
  );

  const aLevelTopics = [
    {
      name: "Core Pure Mathematics 1",
      subtopics: ["Complex Numbers", "Matrices", "Further Algebra & Functions", "Further Calculus", "Further Vectors", "Polar Coordinates", "Hyperbolic Functions", "Proof by Induction"],
    },
    {
      name: "Core Pure Mathematics 2",
      subtopics: ["Complex Numbers (Further)", "Series", "Methods in Calculus", "Volumes of Revolution", "Polar Coordinates (Further)", "Differential Equations", "Modelling with Differential Equations"],
    },
    {
      name: "Further Statistics 1 (Option)",
      subtopics: ["Discrete Probability Distributions", "Poisson Distribution", "Geometric & Negative Binomial", "Hypothesis Testing", "Central Limit Theorem"],
    },
    {
      name: "Further Statistics 2 (Option)",
      subtopics: ["Linear Regression", "Continuous Probability Distributions", "Correlation", "Combinations of Random Variables", "Estimation"],
    },
    {
      name: "Further Mechanics 1 (Option)",
      subtopics: ["Momentum & Impulse", "Work, Energy & Power", "Elastic Strings & Springs", "Elastic Collisions in 1D", "Elastic Collisions in 2D"],
    },
    {
      name: "Further Mechanics 2 (Option)",
      subtopics: ["Circular Motion", "Oscillations (SHM)", "Damped & Forced Oscillations", "Stability"],
    },
    {
      name: "Decision Mathematics 1 (Option)",
      subtopics: ["Algorithms", "Graph Theory", "Algorithms on Graphs", "Critical Path Analysis", "Linear Programming"],
    },
    {
      name: "Decision Mathematics 2 (Option)",
      subtopics: ["Transportation Problems", "Allocation Problems", "Dynamic Programming", "Game Theory", "Flows in Networks"],
    },
    {
      name: "Further Pure Mathematics 1 (Option)",
      subtopics: ["Further Trigonometry", "Coordinate Systems", "Further Calculus", "Further Vectors", "Inequalities"],
    },
    {
      name: "Further Pure Mathematics 2 (Option)",
      subtopics: ["Number Theory", "Groups", "Complex Numbers (Advanced)", "Recurrence Relations", "Matrix Algebra"],
    },
  ];

  for (let ti = 0; ti < aLevelTopics.length; ti++) {
    const topic = aLevelTopics[ti];
    const t = await db.one(
      "INSERT INTO topics (subject_id, name, slug, order_index, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [aLevelFm.id, topic.name, topic.name.toLowerCase().replace(/[^a-z0-9]+/g,"-"), ti, admin.id]
    );
    for (let si = 0; si < topic.subtopics.length; si++) {
      const stName = topic.subtopics[si];
      await db.query(
        "INSERT INTO subtopics (topic_id, name, slug, order_index, created_by) VALUES ($1,$2,$3,$4,$5)",
        [t.id, stName, stName.toLowerCase().replace(/[^a-z0-9]+/g,"-"), si, admin.id]
      );
    }
  }
  console.log("✓ A-Level Further Mathematics created");

  // Add exam papers for both
  const boardRow = await db.one("SELECT id FROM exam_boards WHERE name='Edexcel'");
  const boardId = boardRow?.id;
  const YEARS = [2017, 2018, 2019, 2022, 2023];

  if (boardId) {
    // AS Further Maths papers
    for (const year of YEARS) {
      for (const paper of [
        { n:1, title:`Edexcel AS Further Maths Paper 1: Core Pure (${year})`, marks:75, mins:90 },
        { n:2, title:`Edexcel AS Further Maths Paper 2: Options (${year})`, marks:75, mins:90 },
      ]) {
        await db.query(
          "INSERT INTO past_papers (subject_id, exam_board_id, year, paper_number, title, total_marks, duration_mins, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
          [asFm.id, boardId, year, paper.n, paper.title, paper.marks, paper.mins, admin.id]
        );
      }
    }

    // A-Level Further Maths papers
    for (const year of YEARS) {
      for (const paper of [
        { n:1, title:`Edexcel Further Maths A-Level Paper 1: Core Pure 1 (${year})`, marks:75, mins:90 },
        { n:2, title:`Edexcel Further Maths A-Level Paper 2: Core Pure 2 (${year})`, marks:75, mins:90 },
        { n:3, title:`Edexcel Further Maths A-Level Paper 3: Options A (${year})`, marks:75, mins:90 },
        { n:4, title:`Edexcel Further Maths A-Level Paper 4: Options B (${year})`, marks:75, mins:90 },
      ]) {
        await db.query(
          "INSERT INTO past_papers (subject_id, exam_board_id, year, paper_number, title, total_marks, duration_mins, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
          [aLevelFm.id, boardId, year, paper.n, paper.title, paper.marks, paper.mins, admin.id]
        );
      }
    }
    console.log("✓ Exam papers added");
  }

  console.log("\n✅ Further Mathematics seeding complete!");
  process.exit(0);
}

seedFurtherMaths().catch(e => { console.error("❌", e.message); process.exit(1); });
