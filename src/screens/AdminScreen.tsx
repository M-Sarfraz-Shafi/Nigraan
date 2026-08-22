import { useEffect, useState } from "react";
import { S } from "../styles";
import { api, ApiError } from "../api/client";
import type { AdminProjectSummary, AdminUser, CurrentUser } from "../api/types";
import { Badge, Btn, Card, Input, Label, Select } from "../components/atoms";

export function AdminScreen({ user, onBack }: { user: CurrentUser; onBack: () => void }) {
  const [tab, setTab] = useState<"users" | "projects">("users");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [projects, setProjects] = useState<AdminProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = () => api.admin.listUsers().then(setUsers).catch((e) => setError(e.message));
  const loadProjects = () => api.admin.listProjects().then(setProjects).catch((e) => setError(e.message));

  useEffect(() => {
    loadUsers();
    loadProjects();
  }, []);

  // ---- Create user form ----
  const [nUsername, setNUsername] = useState("");
  const [nPassword, setNPassword] = useState("");
  const [nDisplayName, setNDisplayName] = useState("");
  const [nIsAdmin, setNIsAdmin] = useState(false);
  const [nCanCreate, setNCanCreate] = useState(false);

  const createUser = async () => {
    if (!nUsername.trim() || !nPassword || !nDisplayName.trim()) return;
    try {
      await api.admin.createUser(nUsername.trim(), nPassword, nDisplayName.trim(), nIsAdmin, nCanCreate);
      setNUsername("");
      setNPassword("");
      setNDisplayName("");
      setNIsAdmin(false);
      setNCanCreate(false);
      loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create user");
    }
  };

  const toggleFlag = async (u: AdminUser, flag: "isAdmin" | "canCreateProjects") => {
    try {
      await api.admin.updateUser(u.id, { [flag]: !u[flag] });
      loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update user");
    }
  };

  const resetPassword = async (u: AdminUser) => {
    const password = window.prompt(`New password for ${u.username}:`);
    if (!password) return;
    try {
      await api.admin.resetPassword(u.id, password);
      window.alert(`Password reset for ${u.username}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to reset password");
    }
  };

  const deleteUser = async (u: AdminUser) => {
    if (!window.confirm(`Delete account "${u.username}"? This cannot be undone.`)) return;
    try {
      await api.admin.deleteUser(u.id);
      loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete user");
    }
  };

  const [addOwnerTarget, setAddOwnerTarget] = useState<Record<string, string>>({});
  const addOwner = async (p: AdminProjectSummary) => {
    const userId = addOwnerTarget[p.id];
    if (!userId) return;
    try {
      await api.admin.addOwner(p.id, userId);
      setAddOwnerTarget((t) => ({ ...t, [p.id]: "" }));
      loadProjects();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to add owner");
    }
  };

  const demoteOwner = async (p: AdminProjectSummary, ownerId: string) => {
    try {
      await api.admin.demoteOwner(p.id, ownerId);
      loadProjects();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to demote owner");
    }
  };

  const deleteProject = async (p: AdminProjectSummary) => {
    if (!window.confirm(`Delete project "${p.name}"? This cannot be undone.`)) return;
    try {
      await api.admin.deleteProject(p.id);
      loadProjects();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete project");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bg, padding: "40px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <button onClick={onBack} style={{ fontSize: 12, color: S.textSec, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 6 }}>
              ← Projects
            </button>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: S.text, margin: 0 }}>Admin</h1>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <Btn variant={tab === "users" ? "primary" : "secondary"} onClick={() => setTab("users")}>
            Users
          </Btn>
          <Btn variant={tab === "projects" ? "primary" : "secondary"} onClick={() => setTab("projects")}>
            Projects
          </Btn>
        </div>

        {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}

        {tab === "users" && (
          <>
            <Card style={{ padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: S.text, margin: "0 0 12px", textTransform: "uppercase" }}>Create Account</h3>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <Label>Display Name</Label>
                  <Input value={nDisplayName} onChange={(e) => setNDisplayName(e.target.value)} placeholder="Full name" />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Username</Label>
                  <Input value={nUsername} onChange={(e) => setNUsername(e.target.value)} placeholder="username" />
                </div>
                <div style={{ flex: 1 }}>
                  <Label>Password</Label>
                  <Input type="password" value={nPassword} onChange={(e) => setNPassword(e.target.value)} placeholder="password" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={nCanCreate} onChange={(e) => setNCanCreate(e.target.checked)} />
                  Project Owner (can create &amp; own new projects)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={nIsAdmin} onChange={(e) => setNIsAdmin(e.target.checked)} />
                  Admin
                </label>
              </div>
              <Btn onClick={createUser}>Create</Btn>
              <p style={{ fontSize: 11, color: S.textMuted, marginTop: 8 }}>
                "Project Owner" only controls whether this account can start brand-new projects (and own what it creates). You can also make any
                account a Project Owner of a specific existing project from the Projects tab, regardless of this checkbox.
              </p>
            </Card>

            <Card>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                    {["Name", "Username", "Project Owner", "Admin", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", fontWeight: 600, color: S.textSec, textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((u) => (
                    <tr key={u.id} style={{ borderBottom: `1px solid ${S.borderLight}` }}>
                      <td style={{ padding: "8px 14px", fontWeight: 500, color: S.text }}>{u.displayName}</td>
                      <td style={{ padding: "8px 14px", color: S.textSec }}>@{u.username}</td>
                      <td style={{ padding: "8px 14px" }}>
                        <input type="checkbox" checked={u.canCreateProjects} onChange={() => toggleFlag(u, "canCreateProjects")} disabled={u.id === user.id} />
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        <input type="checkbox" checked={u.isAdmin} onChange={() => toggleFlag(u, "isAdmin")} disabled={u.id === user.id} />
                      </td>
                      <td style={{ padding: "8px 14px", display: "flex", gap: 8 }}>
                        <button onClick={() => resetPassword(u)} style={{ fontSize: 11, color: S.primary, border: "none", background: "none", cursor: "pointer" }}>
                          Reset password
                        </button>
                        {u.id !== user.id && (
                          <button onClick={() => deleteUser(u)} style={{ fontSize: 11, color: "#ef4444", border: "none", background: "none", cursor: "pointer" }}>
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

        {tab === "projects" && (
          <>
            <p style={{ fontSize: 11, color: S.textMuted, margin: "0 0 12px" }}>
              A project can have multiple Project Owners (POs). As admin, you have full access to every project below without needing to be listed
              as a PO or member.
            </p>
            <Card>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                    {["Project", "Owners (POs)", "Members", "Add owner", ""].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", fontWeight: 600, color: S.textSec, textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(projects || []).map((p) => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${S.borderLight}` }}>
                      <td style={{ padding: "8px 14px", fontWeight: 500, color: S.text }}>
                        {p.name}
                        <div style={{ fontSize: 10, color: S.textMuted, fontWeight: 400 }}>created by {p.createdByName}</div>
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {p.owners.length === 0 && <span style={{ fontSize: 11, color: S.textMuted }}>none</span>}
                          {p.owners.map((o) => (
                            <span key={o.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Badge color={S.primary}>{o.displayName}</Badge>
                              <button
                                onClick={() => demoteOwner(p, o.id)}
                                title={`Demote ${o.displayName} to plain member`}
                                style={{ fontSize: 11, color: S.textMuted, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "8px 14px", color: S.textSec }}>{p.memberCount}</td>
                      <td style={{ padding: "8px 14px" }}>
                        <Select
                          value={addOwnerTarget[p.id] || ""}
                          onChange={(v) => setAddOwnerTarget((t) => ({ ...t, [p.id]: v }))}
                          placeholder="Choose user..."
                          options={(users || []).filter((u) => !p.owners.some((o) => o.id === u.id)).map((u) => ({ value: u.id, label: u.displayName }))}
                        />
                      </td>
                      <td style={{ padding: "8px 14px", display: "flex", gap: 8 }}>
                        <button onClick={() => addOwner(p)} style={{ fontSize: 11, color: S.primary, border: "none", background: "none", cursor: "pointer" }}>
                          Add
                        </button>
                        <button onClick={() => deleteProject(p)} style={{ fontSize: 11, color: "#ef4444", border: "none", background: "none", cursor: "pointer" }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
