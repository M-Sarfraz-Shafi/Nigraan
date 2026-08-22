import { useState } from "react";
import { S } from "../styles";
import { Btn, Input, Label } from "../components/atoms";
import { ApiError } from "../api/client";

export function SetupScreen({ onComplete }: { onComplete: (username: string, password: string, displayName: string) => Promise<unknown> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password || !displayName) return;
    setBusy(true);
    setErr(null);
    try {
      await onComplete(username, password, displayName);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: S.bg }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.1)" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: S.text, margin: "0 0 4px" }}>Welcome to Nigraan</h1>
        <p style={{ fontSize: 13, color: S.textSec, margin: "0 0 24px" }}>
          No accounts exist yet on this server. Create the first admin account to get started — no server access needed.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label>Your Name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alice Anderson" />
          </div>
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="alice" />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="password" />
          </div>
          {err && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{err}</p>}
          <Btn onClick={submit} style={{ width: "100%", opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}>
            {busy ? "Creating…" : "Create admin account"}
          </Btn>
        </div>
        <p style={{ fontSize: 11, color: S.textMuted, marginTop: 20 }}>
          This account becomes an admin with permission to create projects. You can create more accounts afterward from the Admin panel.
        </p>
      </div>
    </div>
  );
}
