const crypto = require("node:crypto");
const { db } = require("../db");
const { hashPassword } = require("../auth");

// Optional trailing flags: --admin, --can-create-projects
const rawArgs = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith("--")));
const positional = rawArgs.filter((a) => !a.startsWith("--"));
const [username, password, ...nameParts] = positional;
const displayName = nameParts.join(" ").trim();

if (!username || !password || !displayName) {
  console.error("Usage: npm run create-user -- <username> <password> <display-name> [--admin] [--can-create-projects]");
  process.exit(1);
}

const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
if (existing) {
  console.error(`User "${username}" already exists.`);
  process.exit(1);
}

const isAdmin = flags.has("--admin");
const canCreateProjects = isAdmin || flags.has("--can-create-projects");

const id = crypto.randomUUID();
db.prepare(
  "INSERT INTO users (id, username, password_hash, display_name, is_admin, can_create_projects, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
).run(id, username, hashPassword(password), displayName, isAdmin ? 1 : 0, canCreateProjects ? 1 : 0, new Date().toISOString());

console.log(`Created user "${username}" (${displayName}), id=${id}${isAdmin ? " [admin]" : ""}${canCreateProjects && !isAdmin ? " [can create projects]" : ""}`);
