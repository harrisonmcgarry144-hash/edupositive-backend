const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on("error", (err) => console.error("Unexpected PG pool error:", err));

const db = {
  query:  (text, params) => pool.query(text, params),
  one:    async (text, params) => { const { rows } = await pool.query(text, params); return rows[0] || null; },
  many:   async (text, params) => { const { rows } = await pool.query(text, params); return rows; },
  transaction: async (fn) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};

module.exports = db;
