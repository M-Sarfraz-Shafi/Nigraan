import type { PresenceUser } from "../api/types";

export function PresenceBar({ presence, currentUserId }: { presence: PresenceUser[]; currentUserId: string }) {
  if (!presence.length) return null;
  const colors = ["#2563eb", "#eab308", "#0ea5e9", "#f59e0b", "#16a34a", "#6366f1"];
  const colorFor = (id: string) => colors[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: -4 }} title={presence.map((p) => p.displayName).join(", ")}>
      {presence.map((p, i) => (
        <div
          key={p.userId}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: colorFor(p.userId),
            border: "2px solid #0b1a3d",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: i === 0 ? 0 : -8,
            outline: p.userId === currentUserId ? "1px solid #fff" : "none",
          }}
          title={`${p.displayName}${p.userId === currentUserId ? " (you)" : ""}`}
        >
          {p.displayName[0]?.toUpperCase()}
        </div>
      ))}
    </div>
  );
}
