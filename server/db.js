const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.PM_DB_PATH || path.join(__dirname, "data.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    can_create_projects INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  -- is_po: whether this member is a Project Owner of THIS project. A project can
  -- have multiple POs, assigned/revoked only by an admin (independent of who
  -- originally created the project, and independent of the user's global
  -- can_create_projects flag). Plain membership (is_po = 0) still grants full
  -- editing rights to tasks/timeline/etc — POs additionally get Settings,
  -- Baselines, and member management.
  CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_po INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (project_id, user_id)
  );

  -- The project's planning content (milestones/tasks/team/holidays/baselines) is
  -- stored as one JSON blob per project, matching the shape the frontend already
  -- works with (ProjectData). This keeps the scheduler and every view unchanged;
  -- only the persistence layer moved from IndexedDB to this server.
  CREATE TABLE IF NOT EXISTS project_data (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );
`);

// Defensive migrations for a database created before these columns existed.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userColumns.includes("is_admin")) db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
if (!userColumns.includes("can_create_projects")) db.exec("ALTER TABLE users ADD COLUMN can_create_projects INTEGER NOT NULL DEFAULT 0");

const memberColumns = db.prepare("PRAGMA table_info(project_members)").all().map((c) => c.name);
if (!memberColumns.includes("is_po")) {
  db.exec("ALTER TABLE project_members ADD COLUMN is_po INTEGER NOT NULL DEFAULT 0");
  // Whoever originally created a project (projects.owner_id) becomes its first PO.
  db.exec("UPDATE project_members SET is_po = 1 WHERE (project_id, user_id) IN (SELECT id, owner_id FROM projects)");
}

module.exports = { db };
