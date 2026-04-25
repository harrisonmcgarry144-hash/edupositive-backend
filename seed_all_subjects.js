const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SUBJECTS = [
  {
    name: "Biology", boards: ["AQA","Edexcel A","Edexcel B","OCR A","OCR B","WJEC"],
    topics: [
      { name: "Biological Molecules", subs: ["Water","Carbohydrates","Lipids","Proteins","Nucleic Acids","ATP","Enzymes"] },
      { name: "Cell Biology", subs: ["Cell Structure","Cell Division","Cell Membranes","Transport Across Membranes","Cell Signalling"] },
      { name: "Genetics", subs: ["DNA Replication","Protein Synthesis","Inheritance","Mutations","Genetic Engineering"] },
      { name: "Ecology", subs: ["Ecosystems","Population Dynamics","Nutrient Cycles","Succession","Biodiversity"] },
      { name: "Physiology", subs: ["Digestion","Gas Exchange","Circulatory System","Nervous System","Endocrine System","Homeostasis","Immune System"] },
      { name: "Evolution", subs: ["Natural Selection","Speciation","Evidence for Evolution","Classification"] },
      { name: "Plants", subs: ["Photosynthesis","Transpiration","Plant Hormones","Plant Reproduction"] },
    ]
  },
  {
    name: "Chemistry", boards: ["AQA","Edexcel A","Edexcel B","OCR A","OCR B","WJEC"],
    topics: [
      { name: "Physical Chemistry", subs: ["Atomic Structure","Bonding","Energetics","Kinetics","Chemical Equilibria","Acids and Bases","Redox","Electrochemistry"] },
      { name: "Inorganic Chemistry", subs: ["Periodicity","Group 2","Group 7","Transition Metals","Reactions of Ions"] },
      { name: "Organic Chemistry", subs: ["Alkanes","Alkenes","Alcohols","Halogenoalkanes","Aromatic Chemistry","Carbonyl Compounds","Carboxylic Acids","Amines","Polymers","Amino Acids"] },
      { name: "Analytical Chemistry", subs: ["Mass Spectrometry","Infrared Spectroscopy","NMR Spectroscopy","Chromatography"] },
    ]
  },
  {
    name: "Physics", boards: ["AQA","Edexcel A","Edexcel B","OCR A","OCR B","WJEC"],
    topics: [
      { name: "Mechanics", subs: ["Kinematics","Newton's Laws","Momentum","Energy","Circular Motion","Oscillations"] },
      { name: "Electricity", subs: ["Current and Voltage","Resistance","Circuits","Capacitors","Magnetic Fields","Electromagnetic Induction"] },
      { name: "Waves", subs: ["Wave Properties","Superposition","Optics","Sound","Electromagnetic Spectrum"] },
      { name: "Quantum Physics", subs: ["Photoelectric Effect","Wave-Particle Duality","Atomic Models","Energy Levels"] },
      { name: "Nuclear Physics", subs: ["Radioactivity","Nuclear Reactions","Fission and Fusion","Safety and Uses"] },
      { name: "Thermal Physics", subs: ["Temperature","Ideal Gases","Thermodynamics","Heat Transfer"] },
      { name: "Fields", subs: ["Gravitational Fields","Electric Fields","Magnetic Fields"] },
      { name: "Astrophysics", subs: ["Stars","Cosmology","Telescopes","The Universe"] },
    ]
  },
  {
    name: "Mathematics", boards: ["AQA","Edexcel","OCR A","OCR B","WJEC"],
    topics: [
      { name: "Pure Mathematics", subs: ["Algebra","Coordinate Geometry","Calculus","Trigonometry","Exponentials and Logarithms","Vectors","Proof","Sequences and Series","Binomial Expansion","Parametric Equations","Differential Equations","Numerical Methods"] },
      { name: "Statistics", subs: ["Statistical Sampling","Data Presentation","Probability","Statistical Distributions","Hypothesis Testing","Correlation and Regression"] },
      { name: "Mechanics", subs: ["Kinematics","Forces","Moments","Newton's Laws","Projectiles","Friction"] },
    ]
  },
  {
    name: "Further Mathematics", boards: ["AQA","Edexcel","OCR A","OCR B","WJEC"],
    topics: [
      { name: "Core Pure", subs: ["Complex Numbers","Matrices","Further Algebra","Further Calculus","Polar Coordinates","Hyperbolic Functions","Differential Equations"] },
      { name: "Further Statistics", subs: ["Probability Distributions","Continuous Random Variables","Chi-Squared Tests","Further Hypothesis Testing"] },
      { name: "Further Mechanics", subs: ["Momentum and Impulse","Circular Motion","Elastic Strings","Simple Harmonic Motion"] },
      { name: "Decision Mathematics", subs: ["Algorithms","Graph Theory","Networks","Linear Programming","Game Theory"] },
    ]
  },
  {
    name: "Psychology", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Social Psychology", subs: ["Conformity","Obedience","Prejudice","Prosocial Behaviour","Aggression"] },
      { name: "Cognitive Psychology", subs: ["Memory Models","Forgetting","Eyewitness Testimony","Cognitive Development","Perception"] },
      { name: "Biological Psychology", subs: ["The Brain","Genetics and Behaviour","Hormones","Sleep","Stress"] },
      { name: "Developmental Psychology", subs: ["Attachment","Deprivation","Cognitive Development","Moral Development"] },
      { name: "Psychopathology", subs: ["Phobias","Depression","OCD","Schizophrenia","Eating Disorders"] },
      { name: "Research Methods", subs: ["Experimental Methods","Observational Methods","Self-Report","Correlations","Data Analysis","Statistical Tests"] },
    ]
  },
  {
    name: "Sociology", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Education", subs: ["Role of Education","Class and Achievement","Gender and Achievement","Ethnicity and Achievement","Educational Policy"] },
      { name: "Family", subs: ["Changing Family Patterns","Functionalist Views","Feminist Views","Marxist Views","Childhood"] },
      { name: "Crime and Deviance", subs: ["Measuring Crime","Theories of Crime","Social Distribution","Crime Control","Media and Crime"] },
      { name: "Stratification", subs: ["Social Class","Gender Inequality","Ethnic Inequality","Age","Poverty"] },
      { name: "Religion", subs: ["Religion and Society","Secularisation","Religious Organisations","Religious Fundamentalism"] },
      { name: "Media", subs: ["Media Ownership","Representation","New Media","Media Effects"] },
      { name: "Research Methods", subs: ["Quantitative Methods","Qualitative Methods","Research Ethics","Positivism vs Interpretivism"] },
    ]
  },
  {
    name: "Economics", boards: ["AQA","Edexcel A","Edexcel B","OCR","WJEC"],
    topics: [
      { name: "Microeconomics", subs: ["Supply and Demand","Elasticity","Market Structures","Market Failure","Government Intervention","Labour Markets","Distribution of Income"] },
      { name: "Macroeconomics", subs: ["GDP and Growth","Unemployment","Inflation","Balance of Payments","Monetary Policy","Fiscal Policy","Supply-Side Policies"] },
      { name: "International Economics", subs: ["International Trade","Exchange Rates","Globalisation","Development Economics"] },
    ]
  },
  {
    name: "History", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "British History", subs: ["Tudor England","Stuart Britain","Victorian Britain","20th Century Britain"] },
      { name: "European History", subs: ["French Revolution","Napoleonic Europe","Unification of Germany","Unification of Italy","Weimar Germany","Nazi Germany"] },
      { name: "American History", subs: ["Civil War","Reconstruction","Gilded Age","The New Deal","Civil Rights Movement","Cold War America"] },
      { name: "Russian History", subs: ["Tsarist Russia","1905 Revolution","1917 Revolutions","Stalin's USSR","Cold War USSR"] },
      { name: "World History", subs: ["World War One","World War Two","Cold War","Decolonisation","The Holocaust"] },
    ]
  },
  {
    name: "Geography", boards: ["AQA","Edexcel A","Edexcel B","OCR A","OCR B","WJEC"],
    topics: [
      { name: "Physical Geography", subs: ["Tectonics","Glaciation","Coastal Systems","Rivers","Ecosystems","Weather and Climate"] },
      { name: "Human Geography", subs: ["Urbanisation","Migration","Development","Globalisation","Resource Security","Population"] },
      { name: "Climate Change", subs: ["Causes of Climate Change","Impacts","Mitigation","Adaptation"] },
      { name: "Geographical Skills", subs: ["Fieldwork","Statistical Skills","Maps and GIS","Data Presentation"] },
    ]
  },
  {
    name: "English Literature", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Poetry", subs: ["Pre-1900 Poetry","Modern Poetry","Comparative Poetry","Unseen Poetry","Context and Form"] },
      { name: "Prose", subs: ["19th Century Novel","20th Century Novel","Contemporary Fiction","Gothic Fiction","Dystopian Fiction"] },
      { name: "Drama", subs: ["Shakespeare","Modern Drama","Theatre Context","Dramatic Techniques"] },
      { name: "Literary Criticism", subs: ["Critical Approaches","Feminist Criticism","Marxist Criticism","Post-Colonial Criticism","Reader Response"] },
    ]
  },
  {
    name: "English Language", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Language Analysis", subs: ["Phonology","Morphology","Syntax","Semantics","Pragmatics","Discourse"] },
      { name: "Language Change", subs: ["Historical Language Change","Contemporary Change","Technology and Language","Attitudes to Change"] },
      { name: "Language Diversity", subs: ["Social Variation","Regional Variation","Gender and Language","Ethnicity and Language"] },
      { name: "Language Acquisition", subs: ["Child Language Acquisition","Second Language Acquisition","Theories of Acquisition"] },
    ]
  },
  {
    name: "Law", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Legal System", subs: ["Sources of Law","Court System","Legal Personnel","Access to Justice","Human Rights"] },
      { name: "Criminal Law", subs: ["Actus Reus and Mens Rea","Murder","Manslaughter","Assault","Theft","Fraud","Defences"] },
      { name: "Tort Law", subs: ["Negligence","Occupiers Liability","Nuisance","Vicarious Liability","Remedies"] },
      { name: "Contract Law", subs: ["Formation","Terms","Vitiating Factors","Breach","Remedies","Consumer Rights"] },
    ]
  },
  {
    name: "Politics", boards: ["AQA","Edexcel","OCR"],
    topics: [
      { name: "UK Politics", subs: ["Electoral Systems","Political Parties","Voting Behaviour","Parliament","Prime Minister","Cabinet","Devolution"] },
      { name: "UK Government", subs: ["Constitution","Executive","Legislature","Judiciary","Civil Liberties"] },
      { name: "US Politics", subs: ["US Constitution","Congress","Presidency","Supreme Court","Parties and Elections","Civil Rights"] },
      { name: "Political Ideas", subs: ["Liberalism","Conservatism","Socialism","Feminism","Nationalism","Ecologism","Anarchism"] },
      { name: "Global Politics", subs: ["International Relations","Globalisation","Power","Human Rights","Global Governance"] },
    ]
  },
  {
    name: "Philosophy", boards: ["AQA","Edexcel","OCR"],
    topics: [
      { name: "Epistemology", subs: ["Perception","The Nature of Knowledge","Rationalism","Empiricism","The Problem of Induction"] },
      { name: "Moral Philosophy", subs: ["Utilitarianism","Kantian Ethics","Virtue Ethics","Meta-Ethics","Applied Ethics"] },
      { name: "Metaphysics", subs: ["Personal Identity","Free Will","Mind-Body Problem","The Existence of God"] },
      { name: "Philosophy of Religion", subs: ["Arguments for God","Arguments against God","Religious Language","Religion and Science"] },
      { name: "Logic", subs: ["Deductive Arguments","Inductive Arguments","Fallacies","Critical Thinking"] },
    ]
  },
  {
    name: "Religious Studies", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Philosophy of Religion", subs: ["Arguments for God's Existence","Evil and Suffering","Religious Experience","Miracles","Life After Death"] },
      { name: "Religion and Ethics", subs: ["Natural Moral Law","Utilitarianism","Situation Ethics","Kant","Sexual Ethics","Medical Ethics","Euthanasia"] },
      { name: "Christianity", subs: ["Christian Beliefs","Practices","Relationships","Life and Death","Social Justice"] },
      { name: "Islam", subs: ["Muslim Beliefs","Practices","Community","Diversity","Relations with Other Faiths"] },
      { name: "Judaism", subs: ["Jewish Beliefs","Practices","Community","Identity","Modern Challenges"] },
    ]
  },
  {
    name: "Business Studies", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Marketing", subs: ["Market Research","Marketing Mix","Product","Price","Place","Promotion","Digital Marketing","Segmentation"] },
      { name: "Finance", subs: ["Financial Statements","Ratio Analysis","Break-Even","Cash Flow","Investment Appraisal","Sources of Finance"] },
      { name: "Human Resources", subs: ["Motivation","Leadership","Organisational Structure","Recruitment","Training","Employment Law"] },
      { name: "Operations", subs: ["Production Methods","Quality","Supply Chain","Capacity","Technology in Business"] },
      { name: "Strategy", subs: ["Business Growth","Competitive Advantage","Change Management","Globalisation","Corporate Social Responsibility"] },
    ]
  },
  {
    name: "Computer Science", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Fundamentals of Programming", subs: ["Data Types","Variables","Control Flow","Procedures","Object-Oriented Programming","Functional Programming","Recursion"] },
      { name: "Computer Systems", subs: ["CPU Architecture","Memory","Storage","Operating Systems","Binary","Data Representation"] },
      { name: "Algorithms", subs: ["Searching Algorithms","Sorting Algorithms","Graph Algorithms","Complexity","Big O Notation"] },
      { name: "Data Structures", subs: ["Arrays","Linked Lists","Stacks","Queues","Trees","Hash Tables","Graphs"] },
      { name: "Networks", subs: ["Network Topologies","Protocols","Internet","Security","Encryption","Web Technologies"] },
      { name: "Theory of Computation", subs: ["Turing Machines","Finite State Machines","Regular Languages","Computability"] },
      { name: "Databases", subs: ["Relational Databases","SQL","Normalisation","Database Design"] },
    ]
  },
  {
    name: "Physical Education", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Anatomy and Physiology", subs: ["Skeletal System","Muscular System","Cardiovascular System","Respiratory System","Energy Systems","Neuromuscular System"] },
      { name: "Sport Psychology", subs: ["Motivation","Arousal","Anxiety","Personality","Aggression","Group Dynamics","Leadership"] },
      { name: "Biomechanics", subs: ["Motion","Forces","Levers","Fluid Mechanics","Angular Motion"] },
      { name: "Sport and Society", subs: ["Commercialisation","Media","Ethics","Discrimination","International Sport","Sport Development"] },
      { name: "Training", subs: ["Principles of Training","Training Methods","Periodisation","Performance Analysis","Injury Prevention"] },
    ]
  },
  {
    name: "French", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Language Skills", subs: ["Listening","Speaking","Reading","Writing","Translation","Grammar"] },
      { name: "Social Issues", subs: ["Family","Education","Employment","Health","Poverty"] },
      { name: "Culture", subs: ["French Cinema","French Literature","French Music","Art and Architecture"] },
      { name: "Contemporary Issues", subs: ["Environment","Technology","Globalisation","Immigration"] },
    ]
  },
  {
    name: "Spanish", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Language Skills", subs: ["Listening","Speaking","Reading","Writing","Translation","Grammar"] },
      { name: "Social Issues", subs: ["Family","Education","Employment","Health","Regional Identity"] },
      { name: "Culture", subs: ["Spanish Cinema","Spanish Literature","Art and Architecture","Festivals"] },
      { name: "Contemporary Issues", subs: ["Environment","Technology","Immigration","Political Change"] },
    ]
  },
  {
    name: "German", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Language Skills", subs: ["Listening","Speaking","Reading","Writing","Translation","Grammar"] },
      { name: "Social Issues", subs: ["Family","Education","Employment","Social Problems","Integration"] },
      { name: "Culture", subs: ["German Cinema","German Literature","Music and Art","Reunification"] },
      { name: "Contemporary Issues", subs: ["Environment","Technology","Immigration","Europe and Germany"] },
    ]
  },
  {
    name: "Art & Design", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Fine Art", subs: ["Drawing","Painting","Sculpture","Printmaking","Mixed Media"] },
      { name: "Art History", subs: ["Impressionism","Modernism","Post-Modernism","Contemporary Art","Non-Western Art"] },
      { name: "Design", subs: ["Graphic Design","Product Design","Fashion","Interior Design","Typography"] },
      { name: "Photography", subs: ["Camera Techniques","Composition","Darkroom Processes","Digital Editing","Documentary Photography"] },
    ]
  },
  {
    name: "Music", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Performance", subs: ["Solo Performance","Ensemble","Sight Reading","Technical Development"] },
      { name: "Composition", subs: ["Harmony","Counterpoint","Structure","Orchestration","Electronic Music"] },
      { name: "Music History", subs: ["Baroque","Classical","Romantic","20th Century","Popular Music","World Music"] },
      { name: "Listening and Analysis", subs: ["Melodic Analysis","Harmonic Analysis","Rhythmic Analysis","Form and Structure"] },
    ]
  },
  {
    name: "Drama & Theatre Studies", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Performance", subs: ["Acting Techniques","Voice","Movement","Character Development","Rehearsal Process"] },
      { name: "Devising", subs: ["Devising Process","Physical Theatre","Verbatim Theatre","Site-Specific Theatre"] },
      { name: "Theatre Practitioners", subs: ["Stanislavski","Brecht","Artaud","Berkoff","Lecoq"] },
      { name: "Set Texts", subs: ["Classical Drama","Modern Drama","Contemporary Drama","Political Theatre"] },
    ]
  },
  {
    name: "Media Studies", boards: ["AQA","Eduqas","OCR"],
    topics: [
      { name: "Media Language", subs: ["Semiotics","Narrative","Genre","Representation","Media Forms"] },
      { name: "Media Industries", subs: ["Ownership","Regulation","Distribution","Funding","Digital Media"] },
      { name: "Audiences", subs: ["Audience Theory","Targeting","Reception","Fandom","Participatory Culture"] },
      { name: "Case Studies", subs: ["Film Industry","Television","Newspapers","Advertising","Video Games","Music Videos"] },
    ]
  },
  {
    name: "Film Studies", boards: ["AQA","Eduqas","OCR"],
    topics: [
      { name: "Film Form", subs: ["Cinematography","Editing","Sound","Mise-en-Scene","Narrative"] },
      { name: "Film History", subs: ["Classical Hollywood","New Hollywood","British Cinema","World Cinema","Documentary"] },
      { name: "Film Theory", subs: ["Auteur Theory","Genre Theory","Feminist Film Theory","Post-Colonial Theory"] },
      { name: "Contemporary Film", subs: ["Blockbusters","Independent Film","Global Cinema","Streaming and Distribution"] },
    ]
  },
  {
    name: "Accounting", boards: ["AQA","Edexcel","OCR"],
    topics: [
      { name: "Financial Accounting", subs: ["Double Entry Bookkeeping","Trial Balance","Income Statement","Balance Sheet","Cash Flow Statements"] },
      { name: "Management Accounting", subs: ["Costing","Budgeting","Variance Analysis","Investment Appraisal","Decision Making"] },
      { name: "Business Finance", subs: ["Sources of Finance","Working Capital","Financial Ratios","Taxation","Audit"] },
    ]
  },
  {
    name: "Design & Technology", boards: ["AQA","Edexcel","OCR","WJEC"],
    topics: [
      { name: "Materials", subs: ["Metals","Polymers","Composites","Textiles","Wood","Smart Materials"] },
      { name: "Manufacturing", subs: ["CAD/CAM","Production Processes","Tolerances","Quality Control","Scale of Production"] },
      { name: "Design Process", subs: ["Research","Specification","Ideation","Prototyping","Evaluation"] },
      { name: "Sustainability", subs: ["Lifecycle Assessment","Sustainable Materials","Circular Economy","Social Impact"] },
    ]
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let subjectsAdded = 0;
    let topicsAdded = 0;
    let subtopicsAdded = 0;

    for (const subject of SUBJECTS) {
      // Check if subject already exists
      const existing = await client.query(
        'SELECT id FROM subjects WHERE name=$1', [subject.name]
      );

      let subjectId;
      if (existing.rows.length > 0) {
        subjectId = existing.rows[0].id;
        // Update exam boards
        await client.query(
          'UPDATE subjects SET exam_boards=$1 WHERE id=$2',
          [subject.boards, subjectId]
        );
      } else {
        const res = await client.query(
          'INSERT INTO subjects (name, slug, exam_boards) VALUES ($1,$2,$3) RETURNING id',
          [subject.name, subject.name.toLowerCase().replace(/[^a-z0-9]/g, '-'), subject.boards]
        );
        subjectId = res.rows[0].id;
        subjectsAdded++;
      }

      for (let ti = 0; ti < subject.topics.length; ti++) {
        const topic = subject.topics[ti];
        const existingTopic = await client.query(
          'SELECT id FROM topics WHERE name=$1 AND subject_id=$2', [topic.name, subjectId]
        );

        let topicId;
        if (existingTopic.rows.length > 0) {
          topicId = existingTopic.rows[0].id;
        } else {
          const topicSlug = topic.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + ti;
          const res = await client.query(
            'INSERT INTO topics (subject_id, name, slug, order_index) VALUES ($1,$2,$3,$4) ON CONFLICT (subject_id, slug) DO UPDATE SET name=EXCLUDED.name RETURNING id',
            [subjectId, topic.name, topicSlug, ti]
          );
          topicId = res.rows[0].id;
          topicsAdded++;
        }

        for (let si = 0; si < topic.subs.length; si++) {
          const sub = topic.subs[si];
          const existingSub = await client.query(
            'SELECT id FROM subtopics WHERE name=$1 AND topic_id=$2', [sub, topicId]
          );
          if (existingSub.rows.length === 0) {
            const subSlug = sub.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + si;
          await client.query(
              'INSERT INTO subtopics (topic_id, name, slug, order_index) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
              [topicId, sub, subSlug, si]
            );
            subtopicsAdded++;
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Done! Added ${subjectsAdded} subjects, ${topicsAdded} topics, ${subtopicsAdded} subtopics`);
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
