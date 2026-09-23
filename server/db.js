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

  -- projects.tags: a JSON array of tag IDs (see the "tags" table below) assigned to this
  -- project -- a project picks from the shared tag list rather than typing free text here.
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]'
  );

  -- The shared, reusable tag list every project picks its tags from (managed from the
  -- "Manage Tags" button on the projects screen) — one place to rename/recolor/delete a
  -- label rather than it being duplicated as free text on every project that used it.
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
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

  -- Cross-project planning: a personal "Today" list (kind = 'day', one per user
  -- per calendar date, auto-created on first visit) and user-created "Release"
  -- lists (kind = 'release') with a target date. Either kind just holds pointers
  -- (project_id, task_id) into whichever project's own JSON blob actually owns
  -- that task — nothing about the task itself is duplicated here.
  CREATE TABLE IF NOT EXISTS focus_lists (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('day', 'release')),
    title TEXT NOT NULL,
    target_date TEXT,
    created_at TEXT NOT NULL
  );

  -- position: user-defined sort order within a list (drag-to-reorder in the Planner),
  -- independent of when the item was added. New items get MAX(position)+1000 so most
  -- reorders only ever touch the two rows either side of a drop, never a full renumber.
  CREATE TABLE IF NOT EXISTS focus_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES focus_lists(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    added_at TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    UNIQUE (list_id, project_id, task_id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_focus_lists_day ON focus_lists(owner_id, target_date) WHERE kind = 'day';
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

const projectColumns = db.prepare("PRAGMA table_info(projects)").all().map((c) => c.name);
if (!projectColumns.includes("tags")) db.exec("ALTER TABLE projects ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");

const focusItemColumns = db.prepare("PRAGMA table_info(focus_items)").all().map((c) => c.name);
if (!focusItemColumns.includes("position")) {
  db.exec("ALTER TABLE focus_items ADD COLUMN position REAL NOT NULL DEFAULT 0");
  // Backfill: give existing rows a stable order matching how they were added, per list.
  const rows = db.prepare("SELECT id, list_id FROM focus_items ORDER BY list_id, added_at").all();
  const setPosition = db.prepare("UPDATE focus_items SET position = ? WHERE id = ?");
  let currentList = null;
  let pos = 0;
  for (const row of rows) {
    if (row.list_id !== currentList) {
      currentList = row.list_id;
      pos = 0;
    }
    pos += 1000;
    setPosition.run(pos, row.id);
  }
}

module.exports = { db };
