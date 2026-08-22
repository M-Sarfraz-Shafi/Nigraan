const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { db } = require("./db");

const SESSION_COOKIE = "pm_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    now.toISOString(),
    expires.toISOString(),
  );
  return { token, expires };
}

function destroySession(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function getUserBySession(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name as displayName, u.is_admin as isAdmin, u.can_create_projects as canCreateProjects
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, new Date().toISOString());
  if (!row) return null;
  return { ...row, isAdmin: !!row.isAdmin, canCreateProjects: !!row.canCreateProjects };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

/** Express middleware: attaches req.user if a valid session cookie is present. */
function authMiddleware(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  req.sessionToken = token || null;
  req.user = getUserBySession(token);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  if (!req.user.isAdmin) return res.status(403).json({ error: "Admin only" });
  next();
}

function setSessionCookie(res, token, expires) {
  const secure = process.env.PM_COOKIE_SECURE === "1" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}${secure}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getUserBySession,
  parseCookies,
  authMiddleware,
  requireAuth,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
};
