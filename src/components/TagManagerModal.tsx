import { useState } from "react";
import { S } from "../styles";
import type { Tag } from "../api/types";
import { TAG_COLORS } from "../store/useTags";
import { IconBtn, Input, Trash, XIcon } from "./atoms";

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: c,
            border: value === c ? `2px solid ${S.text}` : "2px solid transparent",
            boxShadow: value === c ? "none" : "0 0 0 1px rgba(0,0,0,0.08)",
            cursor: "pointer",
            padding: 0,
          }}
        />
      ))}
    </div>
  );
}

function TagRow({ tag, onRename, onRecolor, onDelete }: { tag: Tag; onRename: (name: string) => void; onRecolor: (color: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);

  const commitName = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== tag.name) onRename(trimmed);
    else setName(tag.name);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#f9fafb", borderRadius: 8 }}>
      <ColorSwatches value={tag.color} onChange={onRecolor} />
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && commitName()}
          style={{ flex: 1, fontSize: 13, border: `1px solid ${S.border}`, borderRadius: 6, padding: "3px 8px", outline: "none" }}
        />
      ) : (
        <span onClick={() => setEditing(true)} title="Click to rename" style={{ flex: 1, fontSize: 13, fontWeight: 600, color: S.text, cursor: "text" }}>
          {tag.name}
        </span>
      )}
      <IconBtn onClick={onDelete} title="Delete tag (removes it from every project)">
        <Trash />
      </IconBtn>
    </div>
  );
}

export function TagManagerModal({
  tags,
  onCreate,
  onRename,
  onRecolor,
  onDelete,
  onClose,
}: {
  tags: Tag[];
  onCreate: (name: string, color: string) => Promise<unknown>;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!newName.trim()) return;
    try {
      await onCreate(newName.trim(), newColor);
      setNewName("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tag");
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
          <h3 style={{ fontSize: 16, fontWeight: 700, color: S.text, margin: 0 }}>Manage Tags</h3>
          <IconBtn onClick={onClose}>
            <XIcon />
          </IconBtn>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {tags.length === 0 && <p style={{ fontSize: 12, color: S.textMuted, margin: 0 }}>No tags yet — create one below, then assign it to any project.</p>}
          {tags.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tags.map((t) => (
                <TagRow
                  key={t.id}
                  tag={t}
                  onRename={(name) => onRename(t.id, name)}
                  onRecolor={(color) => onRecolor(t.id, color)}
                  onDelete={() => {
                    if (window.confirm(`Delete tag "${t.name}"? It will be removed from every project that has it.`)) onDelete(t.id);
                  }}
                />
              ))}
            </div>
          )}
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="New tag name..." />
              <button
                onClick={create}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", background: S.primary, color: "#fff", border: "none" }}
              >
                Add
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <ColorSwatches value={newColor} onChange={setNewColor} />
            </div>
            {error && <p style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
