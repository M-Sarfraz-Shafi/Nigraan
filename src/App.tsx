import { useState } from "react";
import { useAuth } from "./auth/useAuth";
import { LoginScreen } from "./screens/LoginScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { ProjectListScreen } from "./screens/ProjectListScreen";
import { AdminScreen } from "./screens/AdminScreen";
import { ProjectShell } from "./ProjectShell";
import { S } from "./styles";

export default function App() {
  const { user, needsSetup, loading, login, completeSetup, logout } = useAuth();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: S.textMuted }}>Loading...</div>;
  }

  if (!user) {
    return needsSetup ? <SetupScreen onComplete={completeSetup} /> : <LoginScreen onLogin={login} />;
  }

  if (showAdmin && user.isAdmin) {
    return <AdminScreen user={user} onBack={() => setShowAdmin(false)} />;
  }

  if (!projectId) {
    return <ProjectListScreen user={user} onOpenProject={setProjectId} onOpenAdmin={() => setShowAdmin(true)} onLogout={logout} />;
  }

  return <ProjectShell projectId={projectId} user={user} onBack={() => setProjectId(null)} />;
}
