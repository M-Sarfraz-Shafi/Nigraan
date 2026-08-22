import { useState } from "react";
import { S } from "../styles";
import type { PresenceUser, ProjectMember, ProjectRole } from "../api/types";
import { Badge, Btn, IconBtn, Input, Label, Trash, XIcon } from "./atoms";

export function MembersPanel({
  members,
  presence,
  role,
  currentUserId,
  onAdd,
  onRemove,
  onPromote,
  onDemote,
  onClose,
}: {
  members: ProjectMember[];
  presence: PresenceUser[];
  role: ProjectRole | undefined;
  currentUserId: string;
  onAdd: (username: string, newAccount?: { password: string; displayName: string }) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  onPromote: (userId: string) => Promise<void>;
  onDemote: (userId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // Admins manage membership too, without being a member themselves.
  const isOwner = role === "owner" || role === "admin";
  const onlineIds = new Set(presence.map((p) => p.userId));

  const add = async () => {
    if (!username.trim()) return;
    try {
      if (creatingNew) {
        if (!newPassword || !newDisplayName.trim()) {
          setErr("Password and display name required for a new account");
          return;
        }
        await onAdd(username.trim(), { password: newPassword, displayName: newDisplayName.trim() });
      } else {
        await onAdd(username.trim());
      }
      setUsername("");
      setNewPassword("");
      setNewDisplayName("");
      setCreatingNew(false);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add member");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        backdropFilter: "blur(4px)",
      }}
    >
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: `1px solid ${S.border}` }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>Members</h3>
          <IconBtn onClick={onClose}>
            <XIcon />
          </IconBtn>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {role === "admin" && (
            <p style={{ fontSize: 11, color: S.textMuted, margin: 0, background: "#f9fafb", borderRadius: 8, padding: "8px 12px" }}>
              You're viewing this as an admin — you have full access but aren't a member of this project, so you won't appear in this list or be assignable on tasks.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {members.map((m) => (
              <div
                key={m.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb", borderRadius: 8, padding: "8px 12px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: onlineIds.has(m.id) ? "#16a34a" : "#d1d5db" }} title={onlineIds.has(m.id) ? "Online" : "Offline"} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{m.displayName}</span>
                  <span style={{ fontSize: 11, color: S.textMuted }}>@{m.username}</span>
                  {m.isPo && <Badge color={S.primary}>PO</Badge>}
                </div>
                {isOwner && m.id !== currentUserId && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => (m.isPo ? onDemote(m.id) : onPromote(m.id))}
                      title={m.isPo ? `Demote ${m.displayName} to plain member` : `Make ${m.displayName} a Project Owner`}
                      style={{ fontSize: 11, color: S.primary, border: "none", background: "none", cursor: "pointer", padding: 0 }}
                    >
                      {m.isPo ? "Remove PO" : "Make PO"}
                    </button>
                    <IconBtn
                      onClick={() => {
                        if (window.confirm(`Remove ${m.displayName} from this project? Their tasks will become unassigned.`)) onRemove(m.id);
                      }}
                    >
                      <Trash />
                    </IconBtn>
                  </div>
                )}
              </div>
            ))}
          </div>
          {isOwner ? (
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => !creatingNew && e.key === "Enter" && add()} placeholder="Username..." />
                <Btn onClick={add}>Add</Btn>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: S.textSec, marginTop: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={creatingNew} onChange={(e) => setCreatingNew(e.target.checked)} />
                This person doesn't have an account yet — create one
              </label>
              {creatingNew && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Label>Display Name</Label>
                    <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Full name" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Label>Password</Label>
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="password" />
                  </div>
                </div>
              )}
              {err && <p style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>{err}</p>}
              {!creatingNew && (
                <p style={{ fontSize: 11, color: S.textMuted, marginTop: 8 }}>Enter the username of someone who already has an account, or check the box above to create one for them.</p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: S.textMuted, margin: 0 }}>Only the project owner can add or remove members.</p>
          )}
        </div>
      </div>
    </div>
  );
}
