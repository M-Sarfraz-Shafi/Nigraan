import { useState } from "react";
import { S } from "../styles";
import { Btn, Input, Label } from "../components/atoms";
import { ApiError } from "../api/client";

export function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<unknown> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username || !password) return;
    setBusy(true);
    setErr(null);
    try {
      await onLogin(username, password);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: S.bg }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.1)" }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: S.text, margin: "0 0 4px" }}>Nigraan</h1>
        <p style={{ fontSize: 13, color: S.textSec, margin: "0 0 24px" }}>Sign in to continue</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label>Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="username"
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="password"
            />
          </div>
          {err && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>{err}</p>}
          <Btn onClick={submit} style={{ width: "100%", opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto" }}>
            {busy ? "Signing in…" : "Sign in"}
          </Btn>
        </div>
        <p style={{ fontSize: 11, color: S.textMuted, marginTop: 20 }}>
          No account? Ask whoever runs this server to create one for you via the CLI.
        </p>
      </div>
    </div>
  );
}
