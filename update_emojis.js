require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://edupositive_db_user:kKEo3VkT0f4BZk9OlSIfhiaHAoekEHza@dpg-d7af8oh5pdvs73e9d8gg-a.ohio-postgres.render.com/edupositive_db',
  ssl: { rejectUnauthorized: false }
});

const emojis = {
  'Mathematics': '\u{2211}',
  'Further Mathematics': '\u{221E}',
  'Further Mathematics (A-Level)': '\u{221E}',
  'Physics': '\u{269B}',
  'Chemistry': '\u{2697}',
  'Biology': '\u{1F9EC}',
  'Computer Science': '\u{1F4BB}',
  'Economics': '\u{1F4C8}',
  'Business': '\u{1F4BC}',
  'Business Studies': '\u{1F4BC}',
  'Psychology': '\u{1F9E0}',
  'Sociology': '\u{1F465}',
  'History': '\u{1F4DC}',
  'Geography': '\u{1F30D}',
  'English Literature': '\u{1F4DA}',
  'English Language': '\u{270D}',
  'English Language and Literature': '\u{1F4DD}',
  'Law': '\u{2696}',
  'Politics': '\u{1F3DB}',
  'Philosophy': '\u{1F914}',
  'Religious Studies': '\u{262F}',
  'Art & Design': '\u{1F3A8}',
  'Art and Design': '\u{1F3A8}',
  'Music': '\u{1F3B5}',
  'Drama': '\u{1F3AD}',
  'Film Studies': '\u{1F3AC}',
  'Media Studies': '\u{1F4FA}',
  'Physical Education': '\u{26BD}',
  'Sport Science': '\u{1F3CB}',
  'Design & Technology': '\u{1F527}',
  'Design and Technology': '\u{1F527}',
  'Accounting': '\u{1F4B0}',
  'French': '\u{1F1EB}\u{1F1F7}',
  'Spanish': '\u{1F1EA}\u{1F1F8}',
  'German': '\u{1F1E9}\u{1F1EA}',
  'Latin': '\u{1F3FA}',
  'Environmental Science': '\u{1F331}',
  'Statistics': '\u{1F4CA}',
  'Philosophy & Ethics': '\u{1F914}',
  'Classical Civilisation': '\u{1F3DB}',
  'Ancient History': '\u{26B1}',
  'Food Science': '\u{1F37D}',
};

async function run() {
  const client = await pool.connect();
  try {
    for (const [name, icon] of Object.entries(emojis)) {
      const result = await client.query('UPDATE subjects SET icon=$1 WHERE name=$2', [icon, name]);
      if (result.rowCount > 0) console.log(`Updated: ${name} -> ${icon}`);
    }
    // Set default for any remaining subjects without an icon
    await client.query("UPDATE subjects SET icon='📖' WHERE icon IS NULL OR icon=''");
    console.log('Done!');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
