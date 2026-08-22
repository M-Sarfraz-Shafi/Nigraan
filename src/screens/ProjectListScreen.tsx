import { useEffect, useState } from "react";
import { S } from "../styles";
import { api } from "../api/client";
import type { CurrentUser } from "../api/types";
import type { ProjectSummary } from "../api/types";
import { Badge, Btn, Card, Input } from "../components/atoms";

export function ProjectListScreen({
  user,
  onOpenProject,
  onOpenAdmin,
  onLogout,
}: {
  user: CurrentUser;
  onOpenProject: (id: string) => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listProjects().then(setProjects).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {projects === null && <p style={{ color: S.textMuted }}>Loading…</p>}
        {projects && projects.length === 0 && (
          <Card style={{ padding: 40, textAlign: "center" }}>
            <p style={{ color: S.textMuted, fontSize: 13 }}>No projects yet — create one above to get started.</p>
          </Card>
        )}
        {projects && projects.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {projects.map((p) => (
              <Card
                key={p.id}
                style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div onClick={() => onOpenProject(p.id)} style={{ flex: 1, cursor: "pointer" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: S.textMuted, marginTop: 2 }}>Created {p.createdAt.slice(0, 10)}</div>
                </div>
                <Badge color={p.role === "admin" ? S.accentDark : p.role === "owner" ? S.primary : S.textSec}>{p.role}</Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
