const pool = require("../config/db");

exports.addXP = async (userId, amount) => {
  await pool.query(
    "UPDATE users SET xp = xp + $1 WHERE id = $2",
    [amount, userId]
  );
};

exports.getXP = async (userId) => {
  const result = await pool.query(
    "SELECT xp FROM users WHERE id = $1",
    [userId]
  );

  return result.rows[0];
};