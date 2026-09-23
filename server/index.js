const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { db } = require("./db");
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  authMiddleware,
  requireAuth,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  getUserBySession,
  parseCookies,
} = require("./auth");

const PORT = process.env.PORT || 3001;
const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(authMiddleware);

const now = () => new Date().toISOString();
const userCount = () => db.prepare("SELECT COUNT(*) as n FROM users").get().n;
const MEMBER_COLORS = ["#2563eb", "#eab308", "#0ea5e9", "#f59e0b", "#16a34a", "#6366f1", "#ca8a04", "#0891b2"];

/**
 * Role model:
 *  - "admin": a platform admin. Full access to EVERY project without ever being a
 *    project_members row — admins are deliberately not inserted into any project's
 *    membership, so they never show up as a team/assignable resource, in presence-
 *    as-a-team-member, Resources, or Dashboard workload. They just have an access
 *    override on every endpoint.
 *  - "owner": a Project Owner (PO) of THIS specific project (project_members.is_po = 1).
 *    A project can have multiple POs. Being a PO is independent of who created the
 *    project and independent of the account's global canCreateProjects flag — only
 *    an admin can grant/revoke PO status on a project.
 *  - "member": a plain project member (project_members.is_po = 0). Can edit tasks/
 *    timeline/etc but not Settings, Baselines, or membership.
 *  - null: no access at all.
 */
function projectRole(projectId, user) {
  if (user.isAdmin) return "admin";
  const membership = db.prepare("SELECT is_po FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, user.id);
  if (!membership) return null;
  return membership.is_po ? "owner" : "member";
}
const canManage = (role) => role === "owner" || role === "admin";

function getProjectData(projectId) {
  const row = db.prepare("SELECT data FROM project_data WHERE project_id = ?").get(projectId);
  return row ? JSON.parse(row.data) : null;
}

function saveProjectData(projectId, data, updatedBy) {
  db.prepare("UPDATE project_data SET data = ?, updated_at = ?, updated_by = ? WHERE project_id = ?").run(JSON.stringify(data), now(), updatedBy, projectId);
}

/**
 * There is no separate "collaborator" or "team member" concept — being on a
 * project's membership list is what makes someone both able to edit it and
 * assignable on its tasks. These two helpers keep data.project.teamMembers
 * (which the scheduler/Gantt/Resources/Dashboard already read) in sync with
 * actual project membership, so none of that existing code needs to change.
 * (Admins are never added here — see the role model note above.)
 */
function addTeamMemberToData(data, user) {
  if (data.project.teamMembers.some((m) => m.id === user.id)) return data;
  const color = MEMBER_COLORS[data.project.teamMembers.length % MEMBER_COLORS.length];
  return {
    ...data,
    project: { ...data.project, teamMembers: [...data.project.teamMembers, { id: user.id, name: user.displayName, color, leave: [] }] },
  };
}

/** Removes a member from scheduling data and unassigns (not deletes) their tasks. */
function removeTeamMemberFromData(data, userId) {
  return {
    ...data,
    project: { ...data.project, teamMembers: data.project.teamMembers.filter((m) => m.id !== userId) },
    tasks: data.tasks.map((t) => (t.assignedTo === userId ? { ...t, assignedTo: null } : t)),
  };
}

/**
 * Enforces that data.project.teamMembers always matches actual project membership,
 * regardless of how the incoming `data` got here. This matters most for Import: a
 * JSON file exported from one project (or an older snapshot) can reference people
 * who aren't real members of THIS project — without this, they'd show up as
 * assignable in the UI despite having no real access. Drops phantom members (and
 * unassigns their tasks), adds any real member missing from the list, and keeps
 * existing color/leave data for members who are already present correctly.
 */
function reconcileTeamMembers(projectId, data) {
  const realMembers = db
    .prepare(`SELECT u.id, u.display_name as displayName FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?`)
    .all(projectId);
  const existingById = Object.fromEntries((data.project.teamMembers || []).map((m) => [m.id, m]));
  const teamMembers = realMembers.map((m, i) => {
    const existing = existingById[m.id];
    return existing ? { ...existing, name: m.displayName } : { id: m.id, name: m.displayName, color: MEMBER_COLORS[i % MEMBER_COLORS.length], leave: [] };
  });
  const validIds = new Set(teamMembers.map((m) => m.id));
  const tasks = data.tasks.map((t) => (t.assignedTo && !validIds.has(t.assignedTo) ? { ...t, assignedTo: null } : t));
  return { ...data, project: { ...data.project, teamMembers }, tasks };
}

function createUserRecord({ username, password, displayName, isAdmin = false, canCreateProjects = false }) {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, is_admin, can_create_projects, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, username, hashPassword(password), displayName, isAdmin ? 1 : 0, canCreateProjects ? 1 : 0, now());
  return { id, username, displayName, isAdmin, canCreateProjects };
}

// ---- First-run setup (no shell access required to bootstrap the first admin) ----

app.get("/api/setup-status", (_req, res) => {
  res.json({ needsSetup: userCount() === 0 });
});

app.post("/api/setup", (req, res) => {
  if (userCount() > 0) return res.status(403).json({ error: "Setup already completed" });
  const { username, password, displayName } = req.body || {};
  if (!username || !password || !displayName) return res.status(400).json({ error: "Username, password, and display name required" });
  const user = createUserRecord({ username, password, displayName, isAdmin: true, canCreateProjects: true });
  const { token, expires } = createSession(user.id);
  setSessionCookie(res, token, expires);
  res.json(user);
});

// ---- Auth ----

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const { token, expires } = createSession(user.id);
  setSessionCookie(res, token, expires);
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    isAdmin: !!user.is_admin,
    canCreateProjects: !!user.can_create_projects,
  });
});

app.post("/api/logout", (req, res) => {
  if (req.sessionToken) destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.user);
});

app.get("/api/users", requireAuth, (_req, res) => {
  const users = db.prepare("SELECT id, username, display_name as displayName FROM users ORDER BY username").all();
  res.json(users);
});

// ---- Projects ----

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

app.get("/api/projects", requireAuth, (req, res) => {
  if (req.user.isAdmin) {
    // Admins see every project on the server without being a member of any of them.
    const rows = db.prepare(`SELECT id, name, owner_id as ownerId, created_at as createdAt, tags FROM projects ORDER BY created_at DESC`).all();
    return res.json(rows.map((p) => ({ ...p, tags: parseTags(p.tags), role: "admin" })));
  }
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.owner_id as ownerId, p.created_at as createdAt, p.tags, pm.is_po as isPo
       FROM projects p JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = ?
       ORDER BY p.created_at DESC`,
    )
    .all(req.user.id);
  const withRole = rows.map(({ isPo, tags, ...p }) => ({ ...p, tags: parseTags(tags), role: isPo ? "owner" : "member" }));
  res.json(withRole);
});

app.post("/api/projects", requireAuth, (req, res) => {
  if (!req.user.canCreateProjects) return res.status(403).json({ error: "You don't have permission to create projects. Ask an admin to grant it." });
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Project name required" });
  const id = crypto.randomUUID();
  const ts = now();
  db.prepare("INSERT INTO projects (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)").run(id, name.trim(), req.user.id, ts);
  const startDate = ts.slice(0, 10);
  const targetReleaseDate = new Date(new Date(startDate + "T00:00:00").getTime() + 30 * 864e5).toISOString().slice(0, 10);
  const emptyData = {
    project: { name: name.trim(), startDate, targetReleaseDate, teamMembers: [], holidays: [] },
    milestones: [],
    tasks: [],
    baselines: [],
  };
  let defaultData = emptyData;
  if (req.user.isAdmin) {
    // Admins already have full access to every project via the role bypass — they
    // never become a real project_members row, even for projects they create
    // themselves. An admin-created project starts with no PO until one is assigned
    // from the Admin > Projects tab.
  } else {
    // The creator becomes the project's first PO, and is a project member from the
    // start so they're assignable on day one.
    db.prepare("INSERT INTO project_members (project_id, user_id, is_po, added_at) VALUES (?, ?, 1, ?)").run(id, req.user.id, ts);
    defaultData = addTeamMemberToData(emptyData, req.user);
  }
  db.prepare("INSERT INTO project_data (project_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?)").run(
    id,
    JSON.stringify(defaultData),
    ts,
    req.user.id,
  );
  res.json({ id, name: name.trim(), ownerId: req.user.id, createdAt: ts, tags: [], role: req.user.isAdmin ? "admin" : "owner" });
});

// A project's tags are chosen from the shared `tags` list (see the /api/tags routes
// below) — this just sets *which* of those a project has, so any unknown/deleted id is
// silently dropped rather than trusted. Any member can assign tags, same access level
// as editing the project's own data via PUT below.
app.patch("/api/projects/:id/tags", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!role) return res.status(404).json({ error: "Project not found" });
  const { tags } = req.body || {};
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) return res.status(400).json({ error: "tags must be an array of tag ids" });
  const existingIds = new Set(db.prepare("SELECT id FROM tags").all().map((t) => t.id));
  const cleaned = [...new Set(tags)].filter((id) => existingIds.has(id));
  db.prepare("UPDATE projects SET tags = ? WHERE id = ?").run(JSON.stringify(cleaned), req.params.id);
  res.json({ ok: true, tags: cleaned });
});

app.get("/api/projects/:id", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!role) return res.status(404).json({ error: "Project not found" });
  const project = db.prepare("SELECT id, name, owner_id as ownerId, created_at as createdAt, tags FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const dataRow = db.prepare("SELECT data, updated_at as updatedAt FROM project_data WHERE project_id = ?").get(req.params.id);
  const members = db
    .prepare(
      `SELECT u.id, u.username, u.display_name as displayName, pm.is_po as isPo
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? ORDER BY u.username`,
    )
    .all(req.params.id);
  res.json({
    ...project,
    tags: parseTags(project.tags),
    role,
    members: members.map((m) => ({ ...m, isPo: !!m.isPo })),
    data: JSON.parse(dataRow.data),
    dataUpdatedAt: dataRow.updatedAt,
  });
});

app.put("/api/projects/:id", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!role) return res.status(404).json({ error: "Project not found" });
  const { data } = req.body || {};
  if (!data) return res.status(400).json({ error: "Missing data" });
  const reconciled = reconcileTeamMembers(req.params.id, data);
  const ts = now();
  db.prepare("UPDATE project_data SET data = ?, updated_at = ?, updated_by = ? WHERE project_id = ?").run(
    JSON.stringify(reconciled),
    ts,
    req.user.id,
    req.params.id,
  );
  broadcast(req.params.id, { type: "data-changed", by: req.user.id, at: ts }, req.user.id);
  res.json({ ok: true, updatedAt: ts });
});

app.delete("/api/projects/:id", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!canManage(role)) return res.status(403).json({ error: "Only a project owner or an admin can delete this project" });
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  broadcast(req.params.id, { type: "project-deleted" }, null);
  res.json({ ok: true });
});

app.post("/api/projects/:id/members", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!canManage(role)) return res.status(403).json({ error: "Only a project owner or an admin can add members" });
  const { username, password, displayName } = req.body || {};
  if (!username) return res.status(400).json({ error: "Username required" });

  let user = db.prepare("SELECT id, username, display_name as displayName FROM users WHERE username = ?").get(username);
  if (!user) {
    // No such account yet: create a brand-new one for this teammate, scoped to
    // plain-member privileges (no admin, no project-creation rights, not a PO).
    if (!password || !displayName) return res.status(404).json({ error: `No user "${username}" — provide a password and display name to create one` });
    user = createUserRecord({ username, password, displayName });
  }

  const exists = db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(req.params.id, user.id);
  if (!exists) {
    db.prepare("INSERT INTO project_members (project_id, user_id, added_at) VALUES (?, ?, ?)").run(req.params.id, user.id, now());
  }
  const data = getProjectData(req.params.id);
  if (data) saveProjectData(req.params.id, addTeamMemberToData(data, user), req.user.id);
  broadcast(req.params.id, { type: "members-changed" }, null);
  broadcast(req.params.id, { type: "data-changed", by: req.user.id, at: now() }, null);
  res.json({ id: user.id, username: user.username, displayName: user.displayName });
});

app.delete("/api/projects/:id/members/:userId", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!canManage(role)) return res.status(403).json({ error: "Only a project owner or an admin can remove members" });
  db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
  const data = getProjectData(req.params.id);
  if (data) saveProjectData(req.params.id, removeTeamMemberFromData(data, req.params.userId), req.user.id);
  broadcast(req.params.id, { type: "members-changed" }, null);
  broadcast(req.params.id, { type: "data-changed", by: req.user.id, at: now() }, null);
  res.json({ ok: true });
});

// Lets an existing owner (or admin) promote/demote PO status for this project
// without leaving it — the admin-only /api/admin/projects/:id/owners endpoints
// still exist for cross-project management from the Admin screen.
app.post("/api/projects/:id/members/:userId/promote", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!canManage(role)) return res.status(403).json({ error: "Only a project owner or an admin can promote members" });
  const membership = db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(req.params.id, req.params.userId);
  if (!membership) return res.status(404).json({ error: "This person isn't a member of that project" });
  db.prepare("UPDATE project_members SET is_po = 1 WHERE project_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
  broadcast(req.params.id, { type: "members-changed" }, null);
  res.json({ ok: true });
});

app.post("/api/projects/:id/members/:userId/demote", requireAuth, (req, res) => {
  const role = projectRole(req.params.id, req.user);
  if (!canManage(role)) return res.status(403).json({ error: "Only a project owner or an admin can demote members" });
  const membership = db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(req.params.id, req.params.userId);
  if (!membership) return res.status(404).json({ error: "This person isn't a member of that project" });
  db.prepare("UPDATE project_members SET is_po = 0 WHERE project_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
  broadcast(req.params.id, { type: "members-changed" }, null);
  res.json({ ok: true });
});

// ---- Shared tag list ----
//
// One reusable set of labels (name + color) that projects pick from, rather than each
// project inventing its own free text — rename or recolor a tag once and it updates
// everywhere it's used. Creating/renaming/deleting the list itself is gated behind the
// same trust level as creating a project; any member can still pick from the list for a
// project they have access to (see PATCH /api/projects/:id/tags above).
app.get("/api/tags", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, name, color FROM tags ORDER BY name").all();
  res.json(rows);
});

app.post("/api/tags", requireAuth, (req, res) => {
  if (!req.user.isAdmin && !req.user.canCreateProjects) return res.status(403).json({ error: "You don't have permission to manage tags. Ask an admin to grant it." });
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Tag name required" });
  if (!color || typeof color !== "string") return res.status(400).json({ error: "Tag color required" });
  const trimmed = name.trim();
  const existing = db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE").get(trimmed);
  if (existing) return res.status(409).json({ error: `A tag named "${trimmed}" already exists` });
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)").run(id, trimmed, color, now());
  res.json({ id, name: trimmed, color });
});

app.patch("/api/tags/:id", requireAuth, (req, res) => {
  if (!req.user.isAdmin && !req.user.canCreateProjects) return res.status(403).json({ error: "You don't have permission to manage tags. Ask an admin to grant it." });
  const tag = db.prepare("SELECT * FROM tags WHERE id = ?").get(req.params.id);
  if (!tag) return res.status(404).json({ error: "Tag not found" });
  const { name, color } = req.body || {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: "Tag name required" });
    const trimmed = name.trim();
    const clash = db.prepare("SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?").get(trimmed, req.params.id);
    if (clash) return res.status(409).json({ error: `A tag named "${trimmed}" already exists` });
    db.prepare("UPDATE tags SET name = ? WHERE id = ?").run(trimmed, req.params.id);
  }
  if (color !== undefined) db.prepare("UPDATE tags SET color = ? WHERE id = ?").run(color, req.params.id);
  const updated = db.prepare("SELECT id, name, color FROM tags WHERE id = ?").get(req.params.id);
  res.json(updated);
});

app.delete("/api/tags/:id", requireAuth, (req, res) => {
  if (!req.user.isAdmin && !req.user.canCreateProjects) return res.status(403).json({ error: "You don't have permission to manage tags. Ask an admin to grant it." });
  db.prepare("DELETE FROM tags WHERE id = ?").run(req.params.id);
  // Strip the deleted id from every project that had it — a project's tag list should
  // never reference a tag that no longer exists.
  const rows = db.prepare("SELECT id, tags FROM projects WHERE tags LIKE ?").all(`%${req.params.id}%`);
  const update = db.prepare("UPDATE projects SET tags = ? WHERE id = ?");
  for (const row of rows) {
    const remaining = parseTags(row.tags).filter((t) => t !== req.params.id);
    update.run(JSON.stringify(remaining), row.id);
  }
  res.json({ ok: true });
});

// ---- Cross-project planning: "Today" focus list + user-created "Release" lists ----
//
// A focus list (day or release) never stores task content itself — just
// (project_id, task_id) pointers into whichever project actually owns that
// task. Resolving a list re-reads each referenced project's live JSON blob,
// so status/name edits made from inside the project show up here for free,
// and a task deleted or a project the user lost access to simply drops out
// (and its dangling pointer row is cleaned up) rather than erroring.

function accessibleProjectIds(user) {
  if (user.isAdmin) return db.prepare("SELECT id FROM projects").all().map((p) => p.id);
  return db.prepare("SELECT project_id as id FROM project_members WHERE user_id = ?").all(user.id).map((p) => p.id);
}

function findTask(data, taskId) {
  return data?.tasks?.find((t) => t.id === taskId) || null;
}

function resolveFocusList(list, user) {
  const items = db.prepare("SELECT * FROM focus_items WHERE list_id = ? ORDER BY position, added_at").all(list.id);
  const resolved = [];
  for (const item of items) {
    if (!projectRole(item.project_id, user)) {
      db.prepare("DELETE FROM focus_items WHERE id = ?").run(item.id);
      continue;
    }
    const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(item.project_id);
    const data = getProjectData(item.project_id);
    const task = data && findTask(data, item.task_id);
    if (!project || !task) {
      db.prepare("DELETE FROM focus_items WHERE id = ?").run(item.id);
      continue;
    }
    const milestone = data.milestones.find((m) => m.id === task.milestoneId);
    resolved.push({
      itemId: item.id,
      projectId: item.project_id,
      projectName: project.name,
      taskId: task.id,
      taskName: task.name,
      status: task.status,
      milestoneName: milestone?.name || null,
      estimateDays: task.estimateDays,
      addedAt: item.added_at,
      // The project's own committed release date (not per-task) — lets the planner flag
      // items whose project is due soon/overdue without duplicating that date per task.
      projectTargetDate: data.project.targetReleaseDate || null,
    });
  }
  return {
    id: list.id,
    kind: list.kind,
    title: list.title,
    targetDate: list.target_date,
    createdAt: list.created_at,
    items: resolved,
  };
}

app.get("/api/focus/today", requireAuth, (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : now().slice(0, 10);
  let list = db.prepare("SELECT * FROM focus_lists WHERE owner_id = ? AND kind = 'day' AND target_date = ?").get(req.user.id, date);
  if (!list) {
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO focus_lists (id, owner_id, kind, title, target_date, created_at) VALUES (?, ?, 'day', ?, ?, ?)").run(
      id,
      req.user.id,
      `Today — ${date}`,
      date,
      now(),
    );
    list = db.prepare("SELECT * FROM focus_lists WHERE id = ?").get(id);
  }
  res.json(resolveFocusList(list, req.user));
});

app.get("/api/focus/lists", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM focus_lists WHERE owner_id = ? AND kind = 'release' ORDER BY (target_date IS NULL), target_date, created_at DESC")
    .all(req.user.id);
  res.json(
    rows.map((r) => {
      const { items } = resolveFocusList(r, req.user);
      return {
        id: r.id,
        title: r.title,
        targetDate: r.target_date,
        createdAt: r.created_at,
        itemCount: items.length,
        doneCount: items.filter((i) => i.status === "done").length,
      };
    }),
  );
});

app.post("/api/focus/lists", requireAuth, (req, res) => {
  const { title, targetDate } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "Title required" });
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO focus_lists (id, owner_id, kind, title, target_date, created_at) VALUES (?, ?, 'release', ?, ?, ?)").run(
    id,
    req.user.id,
    title.trim(),
    targetDate || null,
    now(),
  );
  const list = db.prepare("SELECT * FROM focus_lists WHERE id = ?").get(id);
  res.json(resolveFocusList(list, req.user));
});

function ownedList(id, user, kind) {
  const list = db.prepare("SELECT * FROM focus_lists WHERE id = ?").get(id);
  if (!list || list.owner_id !== user.id) return null;
  if (kind && list.kind !== kind) return null;
  return list;
}

app.get("/api/focus/lists/:id", requireAuth, (req, res) => {
  const list = ownedList(req.params.id, req.user);
  if (!list) return res.status(404).json({ error: "List not found" });
  res.json(resolveFocusList(list, req.user));
});

app.patch("/api/focus/lists/:id", requireAuth, (req, res) => {
  const list = ownedList(req.params.id, req.user, "release");
  if (!list) return res.status(404).json({ error: "List not found" });
  const { title, targetDate } = req.body || {};
  if (title !== undefined) db.prepare("UPDATE focus_lists SET title = ? WHERE id = ?").run(title.trim(), list.id);
  if (targetDate !== undefined) db.prepare("UPDATE focus_lists SET target_date = ? WHERE id = ?").run(targetDate || null, list.id);
  res.json(resolveFocusList(db.prepare("SELECT * FROM focus_lists WHERE id = ?").get(list.id), req.user));
});

app.delete("/api/focus/lists/:id", requireAuth, (req, res) => {
  const list = ownedList(req.params.id, req.user, "release");
  if (!list) return res.status(404).json({ error: "List not found" });
  db.prepare("DELETE FROM focus_lists WHERE id = ?").run(list.id);
  res.json({ ok: true });
});

app.post("/api/focus/lists/:id/items", requireAuth, (req, res) => {
  const list = ownedList(req.params.id, req.user);
  if (!list) return res.status(404).json({ error: "List not found" });
  const { projectId, taskId } = req.body || {};
  if (!projectId || !taskId) return res.status(400).json({ error: "projectId and taskId required" });
  if (!projectRole(projectId, req.user)) return res.status(404).json({ error: "Project not found" });
  const data = getProjectData(projectId);
  if (!data || !findTask(data, taskId)) return res.status(404).json({ error: "Task not found" });
  const id = crypto.randomUUID();
  const maxPosition = db.prepare("SELECT MAX(position) as m FROM focus_items WHERE list_id = ?").get(list.id).m || 0;
  db.prepare("INSERT OR IGNORE INTO focus_items (id, list_id, project_id, task_id, added_at, position) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    list.id,
    projectId,
    taskId,
    now(),
    maxPosition + 1000,
  );
  res.json(resolveFocusList(db.prepare("SELECT * FROM focus_lists WHERE id = ?").get(list.id), req.user));
});

app.delete("/api/focus/lists/:id/items/:itemId", requireAuth, (req, res) => {
  const list = ownedList(req.params.id, req.user);
  if (!list) return res.status(404).json({ error: "List not found" });
  db.prepare("DELETE FROM focus_items WHERE id = ? AND list_id = ?").run(req.params.itemId, list.id);
  res.json(resolveFocusList(db.prepare("SELECT * FROM focus_lists WHERE id = ?").get(list.id), req.user));
});

// Lets the planner's drag-to-reorder UI persist a new item order within one list —
// the client sends the full item-id order after a drop, and rows are renumbered by
// index so a stale/partial payload can never scramble the list.
app.post("/api/focus/lists/:id/items/reorder", requireAuth, (req, res) => {
  const list = ownedList(req.params.id, req.user);
  if (!list) return res.status(404).json({ error: "List not found" });
  const { itemIds } = req.body || {};
  if (!Array.isArray(itemIds)) return res.status(400).json({ error: "itemIds required" });
  const existingIds = db.prepare("SELECT id FROM focus_items WHERE list_id = ?").all(list.id).map((r) => r.id);
  const existingSet = new Set(existingIds);
  const ordered = itemIds.filter((id) => existingSet.has(id));
  for (const id of existingIds) if (!ordered.includes(id)) ordered.push(id);
  const setPosition = db.prepare("UPDATE focus_items SET position = ? WHERE id = ? AND list_id = ?");
  ordered.forEach((id, i) => setPosition.run((i + 1) * 1000, id, list.id));
  res.json(resolveFocusList(db.prepare("SELECT * FROM focus_lists WHERE id = ?").get(list.id), req.user));
});

// Marks the underlying task done (or back to not-started) directly from a focus
// list, without having to open its project — edits that project's own data, the
// same as any other task edit, so Timeline/Dashboard/etc there stay in sync.
app.post("/api/focus/lists/:id/items/:itemId/toggle-done", requireAuth, (req, res) => {
  const list = ownedList(req.params.id, req.user);
  if (!list) return res.status(404).json({ error: "List not found" });
  const item = db.prepare("SELECT * FROM focus_items WHERE id = ? AND list_id = ?").get(req.params.itemId, list.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (!projectRole(item.project_id, req.user)) return res.status(404).json({ error: "Project not found" });
  const data = getProjectData(item.project_id);
  const task = data && findTask(data, item.task_id);
  if (!data || !task) return res.status(404).json({ error: "Task not found" });
  const nextStatus = task.status === "done" ? "not_started" : "done";
  const nextData = { ...data, tasks: data.tasks.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)) };
  saveProjectData(item.project_id, nextData, req.user.id);
  broadcast(item.project_id, { type: "data-changed", by: req.user.id, at: now() }, req.user.id);
  res.json(resolveFocusList(list, req.user));
});

// Feeds the planner's drag-and-drop task browser: every open task across every
// project the user can see, grouped by project so the panel can render one
// collapsible section per project instead of a flat list.
app.get("/api/focus/all-tasks", requireAuth, (req, res) => {
  const projectIds = accessibleProjectIds(req.user);
  const groups = [];
  for (const projectId of projectIds) {
    const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(projectId);
    const data = getProjectData(projectId);
    if (!project || !data) continue;
    // Status filtering (e.g. skipping done/not_pursuing) is done client-side so the
    // browse panel's filter chips can toggle any status without another round trip.
    const tasks = data.tasks.map((task) => {
      const milestone = data.milestones.find((m) => m.id === task.milestoneId);
      return { taskId: task.id, taskName: task.name, status: task.status, milestoneName: milestone?.name || null };
    });
    if (tasks.length) groups.push({ projectId, projectName: project.name, tasks });
  }
  groups.sort((a, b) => a.projectName.localeCompare(b.projectName));
  res.json(groups);
});

// Lets the planner's "add a task" picker search across every project the user
// can see, so a day or release list can pull in tasks from any of them.
app.get("/api/focus/search-tasks", requireAuth, (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  const projectIds = accessibleProjectIds(req.user);
  const results = [];
  for (const projectId of projectIds) {
    const project = db.prepare("SELECT name FROM projects WHERE id = ?").get(projectId);
    const data = getProjectData(projectId);
    if (!project || !data) continue;
    for (const task of data.tasks) {
      if (task.status === "done" || task.status === "not_pursuing") continue;
      if (q && !task.name.toLowerCase().includes(q)) continue;
      const milestone = data.milestones.find((m) => m.id === task.milestoneId);
      results.push({
        projectId,
        projectName: project.name,
        taskId: task.id,
        taskName: task.name,
        status: task.status,
        milestoneName: milestone?.name || null,
      });
      if (results.length >= 40) break;
    }
    if (results.length >= 40) break;
  }
  res.json(results);
});

// ---- Admin: user lifecycle ----

app.get("/api/admin/users", requireAdmin, (_req, res) => {
  const users = db
    .prepare(
      "SELECT id, username, display_name as displayName, is_admin as isAdmin, can_create_projects as canCreateProjects, created_at as createdAt FROM users ORDER BY username",
    )
    .all();
  res.json(users.map((u) => ({ ...u, isAdmin: !!u.isAdmin, canCreateProjects: !!u.canCreateProjects })));
});

app.post("/api/admin/users", requireAdmin, (req, res) => {
  const { username, password, displayName, isAdmin, canCreateProjects } = req.body || {};
  if (!username || !password || !displayName) return res.status(400).json({ error: "Username, password, and display name required" });
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(409).json({ error: `User "${username}" already exists` });
  const user = createUserRecord({ username, password, displayName, isAdmin: !!isAdmin, canCreateProjects: !!canCreateProjects });
  res.json(user);
});

app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { isAdmin, canCreateProjects } = req.body || {};
  if (isAdmin !== undefined) db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, req.params.id);
  if (canCreateProjects !== undefined) db.prepare("UPDATE users SET can_create_projects = ? WHERE id = ?").run(canCreateProjects ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/reset-password", requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "New password required" });
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't delete your own account" });

  // Deleting an account for good is different from removing them from one project: it has to
  // unassign their tasks and drop them from the scheduling data of EVERY project they were in,
  // not just one. Since a project can now have multiple POs, there's no "must transfer first"
  // blocker anymore — removing this person as a PO just leaves the project's other POs (or none,
  // which is fine: an admin can always designate a new one).
  const memberships = db.prepare("SELECT project_id as projectId FROM project_members WHERE user_id = ?").all(req.params.id);
  memberships.forEach(({ projectId }) => {
    const data = getProjectData(projectId);
    if (!data) return;
    saveProjectData(projectId, removeTeamMemberFromData(data, req.params.id), req.user.id);
    broadcast(projectId, { type: "members-changed" }, null);
    broadcast(projectId, { type: "data-changed", by: req.user.id, at: now() }, null);
  });

  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ---- Admin: cross-project oversight ----

app.get("/api/admin/projects", requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.owner_id as ownerId, u.display_name as createdByName, p.created_at as createdAt,
              (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as memberCount
       FROM projects p JOIN users u ON u.id = p.owner_id
       ORDER BY p.created_at DESC`,
    )
    .all();
  const owners = db
    .prepare(
      `SELECT pm.project_id as projectId, u.id, u.display_name as displayName
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.is_po = 1`,
    )
    .all();
  res.json(
    rows.map((p) => ({
      ...p,
      owners: owners.filter((o) => o.projectId === p.id).map(({ id, displayName }) => ({ id, displayName })),
    })),
  );
});

app.post("/api/admin/projects/:id/owners", requireAdmin, (req, res) => {
  const { userId } = req.body || {};
  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const user = db.prepare("SELECT id, username, display_name as displayName FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(404).json({ error: "User not found" });

  const exists = db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(req.params.id, userId);
  if (exists) {
    db.prepare("UPDATE project_members SET is_po = 1 WHERE project_id = ? AND user_id = ?").run(req.params.id, userId);
  } else {
    db.prepare("INSERT INTO project_members (project_id, user_id, is_po, added_at) VALUES (?, ?, 1, ?)").run(req.params.id, userId, now());
  }
  const data = getProjectData(req.params.id);
  if (data) saveProjectData(req.params.id, addTeamMemberToData(data, user), req.user.id);
  broadcast(req.params.id, { type: "members-changed" }, null);
  broadcast(req.params.id, { type: "data-changed", by: req.user.id, at: now() }, null);
  res.json({ ok: true });
});

app.post("/api/admin/projects/:id/owners/:userId/demote", requireAdmin, (req, res) => {
  const membership = db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(req.params.id, req.params.userId);
  if (!membership) return res.status(404).json({ error: "This person isn't a member of that project" });
  db.prepare("UPDATE project_members SET is_po = 0 WHERE project_id = ? AND user_id = ?").run(req.params.id, req.params.userId);
  broadcast(req.params.id, { type: "members-changed" }, null);
  res.json({ ok: true });
});

// ---- Static frontend (production) ----
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get(/^\/(?!api|ws).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Nigraan server listening on http://localhost:${PORT}`);
});

// ---- WebSocket: presence + editing badges + data-changed notifications ----
const wss = new WebSocketServer({ server, path: "/ws" });
/** projectId -> Set of { ws, userId, username, displayName, editingTaskId } */
const rooms = new Map();

function roomFor(projectId) {
  if (!rooms.has(projectId)) rooms.set(projectId, new Set());
  return rooms.get(projectId);
}

function presenceList(projectId) {
  return Array.from(roomFor(projectId))
    .map((c) => ({ userId: c.userId, username: c.username, displayName: c.displayName, editingTaskId: c.editingTaskId }))
    .filter((c, i, arr) => arr.findIndex((x) => x.userId === c.userId) === i);
}

function broadcastToRoom(projectId, msg, excludeConn) {
  const payload = JSON.stringify(msg);
  roomFor(projectId).forEach((c) => {
    if (c === excludeConn) return;
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
  });
}

/** Broadcast a data-changed event to every connection in the project's room except the one owned by `excludeUserId`. */
function broadcast(projectId, msg, excludeUserId) {
  const payload = JSON.stringify(msg);
  roomFor(projectId).forEach((c) => {
    if (excludeUserId && c.userId === excludeUserId) return;
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
  });
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const projectId = url.searchParams.get("projectId");
  const cookies = parseCookies(req.headers.cookie);
  const user = getUserBySession(cookies.pm_session);
  if (!projectId || !user || !projectRole(projectId, user)) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const conn = { ws, userId: user.id, username: user.username, displayName: user.displayName, editingTaskId: null };
  roomFor(projectId).add(conn);
  broadcastToRoom(projectId, { type: "presence", users: presenceList(projectId) }, null);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "editing-start") {
      conn.editingTaskId = msg.taskId;
      broadcastToRoom(projectId, { type: "presence", users: presenceList(projectId) }, null);
    } else if (msg.type === "editing-stop") {
      conn.editingTaskId = null;
      broadcastToRoom(projectId, { type: "presence", users: presenceList(projectId) }, null);
    }
  });

  ws.on("close", () => {
    roomFor(projectId).delete(conn);
    broadcastToRoom(projectId, { type: "presence", users: presenceList(projectId) }, null);
  });
});

module.exports = { app, server };
