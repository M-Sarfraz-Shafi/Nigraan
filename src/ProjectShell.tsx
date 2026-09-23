import { useEffect, useMemo, useState } from "react";
import { useRemoteProjectStore } from "./store/useRemoteProjectStore";
import { schedule } from "./domain/schedule";
import { toDate, fmtDate } from "./domain/dates";
import type { Task } from "./domain/types";
import type { CurrentUser } from "./api/types";
import { S } from "./styles";
import { Btn } from "./components/atoms";
import { EditPanel } from "./components/EditPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { MembersPanel } from "./components/MembersPanel";
import { PresenceBar } from "./components/PresenceBar";
import { Toast } from "./components/Toast";
import { DashboardView } from "./views/DashboardView";
import { TimelineView } from "./views/TimelineView";
import { TaskListView } from "./views/TaskListView";
import { ResourceView } from "./views/ResourceView";
import { BaselineView } from "./views/BaselineView";
import { useTags } from "./store/useTags";

type ViewId = "dashboard" | "timeline" | "tasks" | "resources" | "baselines";
const VIEWS: { id: ViewId; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "timeline", label: "Timeline", icon: "📅" },
  { id: "tasks", label: "Tasks", icon: "📋" },
  { id: "resources", label: "Resources", icon: "👥" },
  { id: "baselines", label: "Baselines", icon: "📸" },
];

export function ProjectShell({ projectId, user, onBack }: { projectId: string; user: CurrentUser; onBack: () => void }) {
  const {
    data,
    project,
    role,
    members,
    presence,
    loading,
    error,
    deleted,
    save,
    undo,
    redo,
    canUndo,
    canRedo,
    exportJSON,
    importJSON,
    notifyEditingStart,
    notifyEditingStop,
    addMember,
    removeMember,
    promoteMember,
    demoteMember,
  } = useRemoteProjectStore(projectId);
  const { tags: allTags } = useTags();
  const [view, setView] = useState<ViewId>("dashboard");
  const [editT, setEditT] = useState<Task | null>(null);
  const [showSet, setShowSet] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const sched = useMemo(() => {
    if (!data) return [];
    return schedule(data.tasks, data.project.startDate, data.project.teamMembers, data.project.holidays || []);
  }, [data]);

  // Admins get the same full-access rights as a Project Owner here, without ever
  // being a real member of the project (see the role model note in server/index.js).
  const isOwner = role === "owner" || role === "admin";
  const visibleViews = isOwner ? VIEWS : VIEWS.filter((v) => v.id !== "baselines");

  const editingByTaskId = useMemo(() => {
    const out: Record<string, string> = {};
    presence.forEach((p) => {
      if (p.editingTaskId && p.userId !== user.id) out[p.editingTaskId] = p.displayName;
    });
    return out;
  }, [presence, user.id]);

  useEffect(() => {
    if (editT) {
      notifyEditingStart(editT.id);
      return () => notifyEditingStop();
    }
  }, [editT, notifyEditingStart, notifyEditingStop]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  if (deleted) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16 }}>
        <p style={{ color: S.textSec }}>This project was deleted by its owner.</p>
        <Btn onClick={onBack}>Back to projects</Btn>
      </div>
    );
  }

  if (loading || !data) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: S.textMuted }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16 }}>
        <p style={{ color: "#ef4444" }}>{error}</p>
        <Btn onClick={onBack}>Back to projects</Btn>
      </div>
    );
  }

  const saveTask = (form: Task) => {
    save({ ...data, tasks: data.tasks.map((t) => (t.id === form.id ? form : t)) });
    setEditT(null);
  };
  const delTask = (id: string) => {
    const cids = data.tasks.filter((t) => t.parentId === id).map((t) => t.id);
    const rm = new Set([id, ...cids]);
    save({ ...data, tasks: data.tasks.filter((t) => !rm.has(t.id)).map((t) => ({ ...t, dependencies: (t.dependencies || []).filter((d) => !rm.has(d)) })) });
    setEditT(null);
  };

  // Every project member is auto-added as an assignable team member, so this is
  // really just "no milestones yet" — the starting point is now the Tasks view.
  const ns = data.milestones.length === 0;
  let releaseEnd: Date | null = null;
  sched.forEach((t) => {
    if (t.computed?.endDate) {
      const d = toDate(t.computed.endDate)!;
      if (!releaseEnd || d > releaseEnd) releaseEnd = d;
    }
  });

  return (
    <div style={{ display: "flex", height: "100vh", background: S.bg, fontFamily: '-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif' }}>
      <div style={{ display: "flex", flexDirection: "column", width: 210, flexShrink: 0, background: S.sidebar, borderRight: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ padding: "14px 18px 0" }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: S.accent, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.6px" }}>Nigraan</p>
          <button
            onClick={onBack}
            style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
          >
            ← Projects
          </button>
        </div>
        <div style={{ padding: "0 18px 16px" }}>
          <h1 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>{data.project.name}</h1>
          {releaseEnd && (
            <p
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                color: "#78350f",
                background: S.accent,
                borderRadius: 6,
                padding: "2px 8px",
                margin: "8px 0 0",
              }}
            >
              Release: {fmtDate(releaseEnd)}
            </p>
          )}
          {(project?.tags ?? []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {allTags
                .filter((t) => (project?.tags ?? []).includes(t.id))
                .map((t) => (
                  <span
                    key={t.id}
                    style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: t.color + "33", color: "#fff" }}
                  >
                    {t.name}
                  </span>
                ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <PresenceBar presence={presence} currentUserId={user.id} />
          </div>
        </div>
        <nav style={{ flex: 1, padding: "0 8px" }}>
          {visibleViews.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "9px 12px",
                borderRadius: 8,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "none",
                borderLeft: view === v.id ? `3px solid ${S.accent}` : "3px solid transparent",
                cursor: "pointer",
                marginBottom: 2,
                fontWeight: view === v.id ? 600 : 400,
                background: view === v.id ? "rgba(255,255,255,0.12)" : "transparent",
                color: view === v.id ? "#fff" : "#94a3b8",
              }}
              onMouseEnter={(e) => {
                if (view !== v.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={(e) => {
                if (view !== v.id) e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: 14 }}>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "0 8px 8px", display: "flex", gap: 6 }}>
          <Btn onClick={undo} variant="secondary" style={{ flex: 1, opacity: canUndo ? 1 : 0.4, background: "transparent", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}>
            ↩ Undo
          </Btn>
          <Btn onClick={redo} variant="secondary" style={{ flex: 1, opacity: canRedo ? 1 : 0.4, background: "transparent", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}>
            ↪ Redo
          </Btn>
        </div>
        <div style={{ padding: "0 8px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            onClick={() => setShowMembers(true)}
            style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8, border: "none", cursor: "pointer", background: "transparent", color: "#94a3b8" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ fontSize: 14 }}>👥</span>Members
          </button>
          {isOwner && (
            <button
              onClick={() => setShowSet(true)}
              style={{ width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8, border: "none", cursor: "pointer", background: "transparent", color: "#94a3b8" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ fontSize: 14 }}>⚙️</span>Settings
            </button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {ns && view !== "tasks" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
              <p style={{ fontSize: 18, fontWeight: 700, color: S.text, marginBottom: 8 }}>Welcome</p>
              <p style={{ fontSize: 14, color: S.textSec, marginBottom: 20 }}>Add a milestone to start</p>
              <Btn onClick={() => setView("tasks")}>Go to Tasks</Btn>
            </div>
          </div>
        )}
        {!ns && view === "dashboard" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <DashboardView data={data} scheduled={sched} />
          </div>
        )}
        {!ns && view === "timeline" && (
          <TimelineView data={data} scheduled={sched} save={save} onEditTask={(t) => setEditT(t)} editingByTaskId={editingByTaskId} />
        )}
        {view === "tasks" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <TaskListView data={data} scheduled={sched} save={save} onEditTask={(t) => setEditT(t)} editingByTaskId={editingByTaskId} currentUserName={user.displayName} />
          </div>
        )}
        {!ns && view === "resources" && <ResourceView data={data} scheduled={sched} save={save} />}
        {!ns && isOwner && view === "baselines" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            <BaselineView data={data} scheduled={sched} save={save} />
          </div>
        )}
      </div>
      {editT && <EditPanel task={editT} data={data} scheduled={sched} onSave={saveTask} onClose={() => setEditT(null)} onDelete={delTask} onToast={notify} />}
      {showSet && isOwner && (
        <SettingsPanel data={data} save={save} onClose={() => setShowSet(false)} onExport={exportJSON} onImport={(f) => importJSON(f).catch(() => notify("Import failed — invalid file."))} />
      )}
      {showMembers && (
        <MembersPanel
          members={members}
          presence={presence}
          role={role}
          currentUserId={user.id}
          onAdd={addMember}
          onRemove={removeMember}
          onPromote={promoteMember}
          onDemote={demoteMember}
          onClose={() => setShowMembers(false)}
        />
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
