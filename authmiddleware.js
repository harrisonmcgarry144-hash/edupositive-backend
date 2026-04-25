const jwt = require("jsonwebtoken");
const db  = require('./index');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "No token provided" });
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await db.oneOrNone(
      "SELECT id, email, role, is_verified, xp, level, streak FROM users WHERE id = $1",
      [payload.sub]
    );
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return res.status(401).json({ error: "Token expired" });
    return res.status(401).json({ error: "Invalid token" });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      req.user = await db.oneOrNone("SELECT id, email, role FROM users WHERE id = $1", [payload.sub]);
    }
  } catch { /* ignore */ }
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
};

const requireTutor = (req, res, next) => {
  if (!["admin","tutor"].includes(req.user?.role))
    return res.status(403).json({ error: "Tutor access required" });
  next();
};

module.exports = { authenticate, optionalAuth, requireAdmin, requireTutor };
