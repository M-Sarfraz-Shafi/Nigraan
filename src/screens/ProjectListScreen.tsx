import { useEffect, useState } from "react";
import { S } from "../styles";
import { api } from "../api/client";
import type { CurrentUser, ProjectSummary, Tag } from "../api/types";
import { Badge, Btn, Card, Input } from "../components/atoms";
import { TagManagerModal } from "../components/TagManagerModal";
import { useTags } from "../store/useTags";

// Which tag chips are toggled on in the filter bar — a per-browser convenience, not shared data.
const LS_TAG_FILTER = "nigraan.projects.tagFilter";

function readTagFilter(): string[] {
  try {
    const raw = localStorage.getItem(LS_TAG_FILTER);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function writeTagFilter(tags: string[]) {
  try {
    localStorage.setItem(LS_TAG_FILTER, JSON.stringify(tags));
  } catch {
    // ignore — private browsing, quota, or storage disabled
  }
}

/** Colored chips for a project's assigned tags, plus a "+ tags" popover to multi-select from the shared list. Click events inside are stopped from bubbling so they never trigger the card's own "open project" click. */
function ProjectTagPicker({ project, allTags, onUpdated }: { project: ProjectSummary; allTags: Tag[]; onUpdated: (tags: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Defensive: tolerate a server response that predates this field (e.g. a stale server
  // process still running old code) rather than crashing the whole page on `.tags.map`.
  const assignedIds = project.tags ?? [];
  const assigned = allTags.filter((t) => assignedIds.includes(t.id));

  const toggle = async (tagId: string) => {
    setSaving(true);
    const next = assignedIds.includes(tagId) ? assignedIds.filter((id) => id !== tagId) : [...assignedIds, tagId];
    try {
      const { tags: updated } = await api.updateProjectTags(project.id, next);
      onUpdated(updated);
    } catch {
      // leave assignment as-is so the user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginTop: 6 }}>
      {assigned.map((t) => (
        <span
          key={t.id}
          style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: t.color + "18", color: t.color, whiteSpace: "nowrap" }}
        >
          {t.name}
        </span>
      ))}
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        style={{ fontSize: 10.5, border: `1px dashed ${S.border}`, borderRadius: 20, padding: "2px 9px", background: "transparent", color: S.textSec, cursor: "pointer" }}
      >
        + tags
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "#fff",
            border: `1px solid ${S.border}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 8,
            zIndex: 10,
            minWidth: 170,
          }}
        >
          {allTags.length === 0 && <p style={{ fontSize: 11, color: S.textMuted, margin: "2px 6px", maxWidth: 160 }}>No tags yet — create one from "Manage Tags".</p>}
          {allTags.map((t) => (
            <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", fontSize: 12, color: S.text, cursor: "pointer", borderRadius: 6 }}>
              <input type="checkbox" checked={assignedIds.includes(t.id)} onChange={() => toggle(t.id)} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, display: "inline-block", flexShrink: 0 }} />
              {t.name}
            </label>
          ))}
          <button
            onClick={() => setOpen(false)}
            style={{ marginTop: 4, fontSize: 11, color: S.textMuted, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjectListScreen({
  user,
  onOpenProject,
  onOpenAdmin,
  onOpenPlanner,
  onLogout,
}: {
  user: CurrentUser;
  onOpenProject: (id: string) => void;
  onOpenAdmin: () => void;
  onOpenPlanner: () => void;
  onLogout: () => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<Set<string>>(() => new Set(readTagFilter()));
  const [managingTags, setManagingTags] = useState(false);
  const { tags: allTags, create: createTag, update: updateTag, remove: removeTag, reload: reloadTags } = useTags();
  const canManageTags = user.isAdmin || user.canCreateProjects;

  const load = () => api.listProjects().then(setProjects).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeTagFilter(Array.from(tagFilter));
  }, [tagFilter]);

  const applyTagUpdate = (projectId: string, tags: string[]) =>
    setProjects((prev) => prev && prev.map((p) => (p.id === projectId ? { ...p, tags } : p)));

  const toggleTagFilter = (tagId: string) =>
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await api.createProject(newName.trim());
      setNewName("");
      await load();
      onOpenProject(p.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  // Deleting a tag also strips it from every project (server-side), so after a delete
  // this session's project list may still hold the stale id until the next `load()` —
  // refresh projects whenever the shared tag list changes to stay in sync.
  const handleDeleteTag = async (id: string) => {
    await removeTag(id);
    await load();
    setTagFilter((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const usedTagIds = projects ? Array.from(new Set(projects.flatMap((p) => p.tags ?? []))) : [];
  const filterTags = allTags.filter((t) => usedTagIds.includes(t.id)).sort((a, b) => a.name.localeCompare(b.name));
  const visibleProjects = projects && (tagFilter.size === 0 ? projects : projects.filter((p) => (p.tags ?? []).some((t) => tagFilter.has(t))));

  return (
    <div style={{ minHeight: "100vh", background: S.bg, padding: "40px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: S.primary, margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Nigraan</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: S.text, margin: 0 }}>Your Projects</h1>
            <p style={{ fontSize: 13, color: S.textSec, margin: "4px 0 0" }}>Signed in as {user.displayName}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={onOpenPlanner} variant="secondary">
              🗓️ Today & Priorities
            </Btn>
            {canManageTags && (
              <Btn onClick={() => setManagingTags(true)} variant="secondary">
                🏷️ Manage Tags
              </Btn>
            )}
            {user.isAdmin && (
              <Btn onClick={onOpenAdmin} variant="secondary">
                ⚙️ Admin
              </Btn>
            )}
            <Btn onClick={onLogout} variant="secondary">
              Sign out
            </Btn>
          </div>
        </div>

        <Card style={{ padding: "14px 18px", marginBottom: 20, cursor: "pointer" }}>
          <div onClick={onOpenPlanner} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>Plan today across every project</div>
              <div style={{ fontSize: 11, color: S.textMuted, marginTop: 2 }}>Pick what you're working on today, or bundle tasks toward a release deadline.</div>
            </div>
            <span style={{ fontSize: 12, color: S.primary, fontWeight: 600 }}>Open Today & Priorities →</span>
          </div>
        </Card>

        {user.canCreateProjects ? (
          <Card style={{ padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                placeholder="New project name..."
              />
              <Btn onClick={createProject} style={{ opacity: creating ? 0.6 : 1, pointerEvents: creating ? "none" : "auto" }}>
                Create
              </Btn>
            </div>
          </Card>
        ) : (
          <Card style={{ padding: 16, marginBottom: 20, background: "#f9fafb" }}>
            <p style={{ fontSize: 12, color: S.textSec, margin: 0 }}>
              You don't have permission to create projects yet. Ask an admin to grant it, or ask a project owner to add you to theirs.
            </p>
          </Card>
        )}

        {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}

        {filterTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: S.textMuted, fontWeight: 600 }}>Filter:</span>
            {filterTags.map((t) => {
              const active = tagFilter.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTagFilter(t.id)}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 20,
                    border: `1px solid ${active ? t.color : S.border}`,
                    background: active ? t.color + "18" : "#fff",
                    color: active ? t.color : S.textSec,
                    cursor: "pointer",
                  }}
                >
                  {t.name}
                </button>
              );
            })}
            {tagFilter.size > 0 && (
              <button
                onClick={() => setTagFilter(new Set())}
                style={{ fontSize: 11, color: S.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {projects === null && <p style={{ color: S.textMuted }}>Loading…</p>}
        {projects && projects.length === 0 && (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <p style={{ color: S.textMuted, fontSize: 13 }}>No projects yet — create one above to get started.</p>
          </Card>
        )}
        {projects && projects.length > 0 && visibleProjects && visibleProjects.length === 0 && (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <p style={{ color: S.textMuted, fontSize: 13 }}>No projects match the selected tags.</p>
          </Card>
        )}
        {visibleProjects && visibleProjects.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleProjects.map((p) => (
              <Card key={p.id} style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div onClick={() => onOpenProject(p.id)} style={{ cursor: "pointer" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: S.textMuted, marginTop: 2 }}>Created {p.createdAt.slice(0, 10)}</div>
                  </div>
                  <ProjectTagPicker project={p} allTags={allTags} onUpdated={(tags) => applyTagUpdate(p.id, tags)} />
                </div>
                <Badge color={p.role === "admin" ? S.accentDark : p.role === "owner" ? S.primary : S.textSec}>{p.role}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>

      {managingTags && (
        <TagManagerModal
          tags={allTags}
          onCreate={createTag}
          onRename={(id, name) => updateTag(id, { name })}
          onRecolor={(id, color) => updateTag(id, { color })}
          onDelete={handleDeleteTag}
          onClose={() => {
            setManagingTags(false);
            reloadTags();
          }}
        />
      )}
    </div>
  );
}
