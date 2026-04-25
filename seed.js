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

const SUBJECTS = [
  {
    name: "Biology", slug: "biology", icon: "🧬", color: "#22d3a0", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Biological Molecules", subtopics: ["Carbohydrates", "Lipids", "Proteins", "Nucleic Acids", "Enzymes", "Water & Inorganic Ions"] },
      { name: "Cell Biology", subtopics: ["Cell Structure", "Cell Division", "Transport Across Membranes", "Cell Recognition & Immune System"] },
      { name: "Organisms Exchange Substances", subtopics: ["Surface Area & Volume", "Gas Exchange", "Digestion & Absorption", "Mass Transport"] },
      { name: "Genetics, Variation & Evolution", subtopics: ["DNA, Genes & Chromosomes", "DNA & Protein Synthesis", "Genetic Diversity", "Biodiversity", "Classification", "Evolution"] },
      { name: "Energy Transfers", subtopics: ["Photosynthesis", "Respiration", "Energy & Ecosystems"] },
      { name: "Organisms Respond to Changes", subtopics: ["Nervous System", "Hormonal Control", "Homeostasis", "Plant Responses"] },
      { name: "Genetics & Ecosystems", subtopics: ["Inheritance", "Populations", "Ecosystems", "Populations in Ecosystems"] },
    ],
  },
  {
    name: "Chemistry", slug: "chemistry", icon: "⚗️", color: "#3b82f6", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Physical Chemistry", subtopics: ["Atomic Structure", "Amount of Substance", "Bonding", "Energetics", "Kinetics", "Chemical Equilibria", "Oxidation & Reduction", "Electrode Potentials", "Acids & Bases"] },
      { name: "Inorganic Chemistry", subtopics: ["Periodicity", "Group 2 Elements", "Group 7 Elements", "Properties of Period 3 Elements", "Transition Metals", "Reactions of Ions in Aqueous Solution"] },
      { name: "Organic Chemistry", subtopics: ["Introduction to Organic Chemistry", "Alkanes", "Halogenoalkanes", "Alkenes", "Alcohols", "Organic Analysis", "Optical Isomerism", "Aldehydes & Ketones", "Carboxylic Acids", "Amines", "Polymers", "Amino Acids & Proteins", "DNA & Other Molecules"] },
    ],
  },
  {
    name: "Mathematics", slug: "mathematics", icon: "∑", color: "#f59e0b", levelType: "a-level", board: "Edexcel",
    topics: [
      { name: "Pure Mathematics", subtopics: ["Algebra & Functions", "Coordinate Geometry", "Sequences & Series", "Trigonometry", "Exponentials & Logarithms", "Differentiation", "Integration", "Numerical Methods", "Vectors", "Proof"] },
      { name: "Statistics", subtopics: ["Statistical Sampling", "Data Presentation", "Probability", "Statistical Distributions", "Hypothesis Testing"] },
      { name: "Mechanics", subtopics: ["Quantities & Units", "Kinematics", "Forces & Newton's Laws", "Moments", "Projectiles"] },
    ],
  },
  {
    name: "Further Mathematics", slug: "further-mathematics", icon: "∞", color: "#8b5cf6", levelType: "a-level", board: "Edexcel",
    topics: [
      { name: "Core Pure Mathematics", subtopics: ["Complex Numbers", "Matrices", "Further Algebra", "Further Calculus", "Vectors", "Polar Coordinates", "Hyperbolic Functions", "Differential Equations"] },
      { name: "Further Statistics", subtopics: ["Linear Regression", "Probability Distributions", "Inference", "Chi Squared Tests"] },
      { name: "Further Mechanics", subtopics: ["Momentum & Impulse", "Work Energy & Power", "Elastic Strings", "Circular Motion", "Oscillations"] },
      { name: "Decision Mathematics", subtopics: ["Algorithms", "Graph Theory", "Networks", "Linear Programming", "Game Theory"] },
    ],
  },
  {
    name: "Physics", slug: "physics", icon: "⚛️", color: "#06b6d4", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Measurements & Their Errors", subtopics: ["Use of SI Units", "Limitations of Physical Measurements", "Estimation of Physical Quantities"] },
      { name: "Particles & Radiation", subtopics: ["Particles", "Electromagnetic Radiation", "Quantum Phenomena"] },
      { name: "Waves", subtopics: ["Progressive Waves", "Refraction & Diffraction", "Optics", "Superposition"] },
      { name: "Mechanics & Materials", subtopics: ["Force & Motion", "Work Energy & Power", "Materials"] },
      { name: "Electricity", subtopics: ["Current & Charge", "Resistance", "Circuits", "Potential Divider", "Electromotive Force"] },
      { name: "Further Mechanics & Thermal Physics", subtopics: ["Periodic Motion", "Thermal Physics", "Ideal Gases"] },
      { name: "Fields & Their Consequences", subtopics: ["Gravitational Fields", "Electric Fields", "Capacitors", "Magnetic Fields", "Electromagnetic Induction"] },
      { name: "Nuclear Physics", subtopics: ["Radioactivity", "Nuclear Energy"] },
      { name: "Astrophysics", subtopics: ["Telescopes", "Classification of Stars", "Cosmology"] },
    ],
  },
  {
    name: "English Literature", slug: "english-literature", icon: "📖", color: "#ec4899", levelType: "a-level", board: "Edexcel",
    topics: [
      { name: "Poetry", subtopics: ["Poetry Anthology", "Unseen Poetry", "Poetic Techniques", "Contextual Influences"] },
      { name: "Prose", subtopics: ["Set Texts", "Victorian Fiction", "Modern Prose", "Comparative Study"] },
      { name: "Drama", subtopics: ["Shakespeare", "Modern Drama", "Dramatic Techniques", "Performance Context"] },
      { name: "Literary Theory & Context", subtopics: ["Feminist Criticism", "Marxist Criticism", "Post-Colonial Theory", "Historical Context"] },
    ],
  },
  {
    name: "English Language", slug: "english-language", icon: "✍️", color: "#f97316", levelType: "a-level", board: "Edexcel",
    topics: [
      { name: "Language & Context", subtopics: ["Register", "Audience & Purpose", "Mode & Medium", "Pragmatics"] },
      { name: "Language Variation", subtopics: ["Regional Dialects", "Social Variation", "Gender & Language", "Occupational Language"] },
      { name: "Language Change", subtopics: ["Historical Change", "Contemporary Change", "Technology & Language"] },
      { name: "Analysing Language", subtopics: ["Phonetics & Phonology", "Morphology", "Syntax", "Semantics", "Discourse"] },
      { name: "Language Acquisition", subtopics: ["Child Language Acquisition", "Reading & Writing Development"] },
    ],
  },
  {
    name: "History", slug: "history", icon: "🏛️", color: "#a16207", levelType: "a-level", board: "Edexcel",
    topics: [
      { name: "British History", subtopics: ["The Tudors", "Stuart Britain", "Industrial Revolution", "20th Century Britain"] },
      { name: "European History", subtopics: ["French Revolution", "Unification of Germany & Italy", "World War 1", "Rise of Fascism", "World War 2"] },
      { name: "American History", subtopics: ["Civil War", "Progressive Era", "Cold War America", "Civil Rights Movement"] },
      { name: "Russian & Soviet History", subtopics: ["Tsarist Russia", "Russian Revolution", "Stalin's Soviet Union", "Cold War"] },
      { name: "Historical Concepts", subtopics: ["Causation", "Consequence", "Change & Continuity", "Historical Interpretations", "Source Analysis"] },
    ],
  },
  {
    name: "Philosophy", slug: "philosophy", icon: "🤔", color: "#7c3aed", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Epistemology", subtopics: ["Perception", "The Nature of Knowledge", "Rationalism", "Empiricism", "Scepticism"] },
      { name: "Moral Philosophy", subtopics: ["Utilitarianism", "Kantian Ethics", "Aristotelian Virtue Ethics", "Meta-Ethics"] },
      { name: "Philosophy of Mind", subtopics: ["Dualism", "Physicalism", "Functionalism", "Consciousness"] },
      { name: "Philosophy of Religion", subtopics: ["Arguments for God's Existence", "Arguments Against God", "Religious Language", "Life After Death"] },
      { name: "Political Philosophy", subtopics: ["Social Contract", "Justice", "Liberty", "Political Authority"] },
    ],
  },
  {
    name: "Law", slug: "law", icon: "⚖️", color: "#1d4ed8", levelType: "a-level", board: "OCR",
    topics: [
      { name: "The Legal System", subtopics: ["Court Structure", "Judicial Precedent", "Statutory Interpretation", "Law Reform", "Access to Justice"] },
      { name: "Criminal Law", subtopics: ["Elements of a Crime", "Offences Against the Person", "Property Offences", "Defences", "Sentencing"] },
      { name: "Contract Law", subtopics: ["Formation of Contract", "Terms", "Vitiating Factors", "Discharge", "Remedies"] },
      { name: "Tort Law", subtopics: ["Negligence", "Occupiers Liability", "Nuisance", "Defamation", "Remedies in Tort"] },
      { name: "Human Rights", subtopics: ["Human Rights Act 1998", "European Convention on Human Rights", "Case Studies"] },
    ],
  },
  {
    name: "Psychology", slug: "psychology", icon: "🧠", color: "#db2777", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Social Psychology", subtopics: ["Social Influence", "Obedience", "Conformity", "Minority Influence", "Social Change"] },
      { name: "Cognitive Psychology", subtopics: ["Memory Models", "Forgetting", "Eyewitness Testimony", "Cognitive Development"] },
      { name: "Biological Psychology", subtopics: ["Biopsychology", "The Nervous System", "Hormones", "Sleep & Dreaming", "Brain Structure"] },
      { name: "Developmental Psychology", subtopics: ["Attachment", "Bowlby's Theory", "Types of Attachment", "Deprivation"] },
      { name: "Psychopathology", subtopics: ["Defining Abnormality", "Phobias", "Depression", "OCD", "Treatments"] },
      { name: "Research Methods", subtopics: ["Experiments", "Observations", "Questionnaires", "Correlation", "Statistical Tests", "Ethics"] },
    ],
  },
  {
    name: "Sociology", slug: "sociology", icon: "👥", color: "#059669", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Education", subtopics: ["Role of Education", "Class & Achievement", "Gender & Achievement", "Ethnicity & Achievement", "School Subcultures", "Educational Policy"] },
      { name: "Family", subtopics: ["Family Diversity", "Changing Family Patterns", "Gender Roles", "Childhood", "Demographic Trends"] },
      { name: "Crime & Deviance", subtopics: ["Functionalist Theories", "Strain Theory", "Subcultural Theory", "Interactionism", "Marxist Theories", "Feminist Theories", "Crime Statistics"] },
      { name: "Beliefs in Society", subtopics: ["Religion & Social Change", "Secularisation", "Religious Organisations", "Ideology"] },
      { name: "Stratification & Differentiation", subtopics: ["Social Class", "Gender Inequality", "Ethnic Inequality", "Globalisation"] },
      { name: "Research Methods", subtopics: ["Quantitative Methods", "Qualitative Methods", "Mixed Methods", "Ethics", "Reliability & Validity"] },
    ],
  },
  {
    name: "Economics", slug: "economics", icon: "📈", color: "#16a34a", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Microeconomics", subtopics: ["Supply & Demand", "Elasticity", "Market Failure", "Government Intervention", "Theory of the Firm", "Labour Markets"] },
      { name: "Macroeconomics", subtopics: ["Measures of Economic Performance", "Aggregate Demand & Supply", "Economic Growth", "Inflation", "Unemployment", "Balance of Payments"] },
      { name: "International Economics", subtopics: ["International Trade", "Exchange Rates", "Trade Policy", "Globalisation", "Development Economics"] },
      { name: "Financial Markets", subtopics: ["Role of Financial Markets", "Market Failure in Financial Markets", "Regulation"] },
    ],
  },
  {
    name: "Business Studies", slug: "business-studies", icon: "💼", color: "#0891b2", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Business & Its Environment", subtopics: ["Business Objectives", "External Environment", "Stakeholders", "Business Ethics", "Globalisation"] },
      { name: "Marketing", subtopics: ["Market Research", "Marketing Mix", "Product Life Cycle", "Market Segmentation", "Digital Marketing"] },
      { name: "Finance", subtopics: ["Financial Statements", "Ratio Analysis", "Investment Appraisal", "Sources of Finance", "Cash Flow"] },
      { name: "Human Resources", subtopics: ["Organisational Structure", "Motivation", "Leadership", "HR Strategies", "Employment Relations"] },
      { name: "Operations", subtopics: ["Production Methods", "Lean Production", "Quality Management", "Supply Chain", "Technology in Operations"] },
      { name: "Strategy", subtopics: ["Corporate Strategy", "Ansoff Matrix", "Porter's Strategies", "Change Management", "Business Failure"] },
    ],
  },
  {
    name: "Politics", slug: "politics", icon: "🗳️", color: "#dc2626", levelType: "a-level", board: "Edexcel",
    topics: [
      { name: "UK Politics", subtopics: ["Democracy & Participation", "Political Parties", "Electoral Systems", "Voting Behaviour", "Pressure Groups"] },
      { name: "UK Government", subtopics: ["The Constitution", "Parliament", "The Prime Minister & Cabinet", "The Judiciary", "Devolution"] },
      { name: "US Politics & Government", subtopics: ["US Constitution", "US Congress", "US Presidency", "US Supreme Court", "US Electoral Process"] },
      { name: "Political Ideas", subtopics: ["Liberalism", "Conservatism", "Socialism", "Feminism", "Nationalism", "Multiculturalism", "Ecologism"] },
    ],
  },
  {
    name: "Geography", slug: "geography", icon: "🌍", color: "#65a30d", levelType: "a-level", board: "AQA",
    topics: [
      { name: "Physical Geography", subtopics: ["Water & Carbon Cycles", "Hot Desert Systems", "Coastal Systems", "Glacial Systems", "Hazards"] },
      { name: "Human Geography", subtopics: ["Global Systems & Governance", "Changing Places", "Contemporary Urban Environments", "Population & the Environment", "Resource Security"] },
      { name: "Geographical Skills", subtopics: ["Cartographic Skills", "Graphical Skills", "Statistical Skills", "Fieldwork"] },
    ],
  },
];

async function seed() {
  console.log("🌱 Seeding EduPositive database...\n");

  // Get admin user
  const admin = await db.one("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!admin) {
    console.error("❌ No admin user found. Register and set admin first.");
    process.exit(1);
  }
  console.log(`✓ Admin found: ${admin.id}\n`);

  for (const subject of SUBJECTS) {
    // Create subject
    const existing = await db.one("SELECT id FROM subjects WHERE slug=$1", [subject.slug]);
    let subjectId;

    if (existing) {
      subjectId = existing.id;
      console.log(`→ Subject exists: ${subject.name}`);
    } else {
      const s = await db.one(
        `INSERT INTO subjects (name, slug, icon, color, level_type, description, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [subject.name, subject.slug, subject.icon, subject.color, subject.levelType,
         `${subject.name} A-Level (${subject.board})`, admin.id]
      );
      subjectId = s.id;
      console.log(`✓ Created subject: ${subject.name} (${subject.board})`);
    }

    // Create topics and subtopics
    for (let ti = 0; ti < subject.topics.length; ti++) {
      const topic = subject.topics[ti];
      const topicSlug = topic.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      const existingTopic = await db.one(
        "SELECT id FROM topics WHERE subject_id=$1 AND slug=$2",
        [subjectId, topicSlug]
      );
      let topicId;

      if (existingTopic) {
        topicId = existingTopic.id;
      } else {
        const t = await db.one(
          `INSERT INTO topics (subject_id, name, slug, order_index, created_by)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [subjectId, topic.name, topicSlug, ti, admin.id]
        );
        topicId = t.id;
        console.log(`  ✓ Topic: ${topic.name}`);
      }

      // Create subtopics
      for (let si = 0; si < topic.subtopics.length; si++) {
        const stName = topic.subtopics[si];
        const stSlug = stName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        const existingSt = await db.one(
          "SELECT id FROM subtopics WHERE topic_id=$1 AND slug=$2",
          [topicId, stSlug]
        );

        if (!existingSt) {
          await db.query(
            `INSERT INTO subtopics (topic_id, name, slug, order_index, created_by)
             VALUES ($1,$2,$3,$4,$5)`,
            [topicId, stName, stSlug, si, admin.id]
          );
        }
      }
    }
    console.log(`  ✓ ${subject.topics.reduce((a, t) => a + t.subtopics.length, 0)} subtopics created\n`);
  }

  console.log("✅ Seeding complete! All subjects, topics and subtopics are ready.");
  process.exit(0);
}

seed().catch(e => { console.error("❌ Seed failed:", e.message); process.exit(1); });
