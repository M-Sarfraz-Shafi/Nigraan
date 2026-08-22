import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { PresenceUser, ProjectDetail, ProjectMember, WsMessage } from "../api/types";
import type { ProjectData } from "../domain/types";

const MAX_HISTORY = 50;

export function useRemoteProjectStore(projectId: string) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  const past = useRef<ProjectData[]>([]);
  const future = useRef<ProjectData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistoryFlags = () => {
    setCanUndo(past.current.length > 0);
    setCanRedo(future.current.length > 0);
  };

  const wsRef = useRef<WebSocket | null>(null);
  const dataRef = useRef<ProjectData | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const refreshMembers = useCallback(async () => {
    try {
      const detail = await api.getProject(projectId);
      setProject(detail);
    } catch {
      // ignore — a member-list refresh failing isn't fatal
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDeleted(false);
    past.current = [];
    future.current = [];
    syncHistoryFlags();
    api
      .getProject(projectId)
      .then((detail) => {
        if (cancelled) return;
        setProject(detail);
        setData(detail.data);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message || "Failed to load project"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?projectId=${projectId}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg: WsMessage = JSON.parse(ev.data);
      if (msg.type === "presence") setPresence(msg.users);
      else if (msg.type === "data-changed") {
        api
          .getProject(projectId)
          .then((detail) => {
            setProject(detail);
            setData(detail.data);
          })
          .catch(() => {});
      } else if (msg.type === "members-changed") {
        refreshMembers();
      } else if (msg.type === "project-deleted") {
        setDeleted(true);
      }
    };
    return () => ws.close();
  }, [projectId, refreshMembers]);

  const persist = useCallback(
    (nd: ProjectData) => {
      api.saveProject(projectId, nd).catch((e) => setError(e.message || "Failed to save"));
    },
    [projectId],
  );

  const save = useCallback(
    (nd: ProjectData) => {
      if (dataRef.current) {
        past.current.push(dataRef.current);
        if (past.current.length > MAX_HISTORY) past.current.shift();
        future.current = [];
      }
      setData(nd);
      persist(nd);
      syncHistoryFlags();
    },
    [persist],
  );

  const undo = useCallback(() => {
    if (!past.current.length || !dataRef.current) return;
    const prev = past.current.pop()!;
    future.current.push(dataRef.current);
    setData(prev);
    persist(prev);
    syncHistoryFlags();
  }, [persist]);

  const redo = useCallback(() => {
    if (!future.current.length || !dataRef.current) return;
    const next = future.current.pop()!;
    past.current.push(dataRef.current);
    setData(next);
    persist(next);
    syncHistoryFlags();
  }, [persist]);

  const exportJSON = useCallback(() => {
    if (!dataRef.current) return;
    const blob = new Blob([JSON.stringify(dataRef.current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataRef.current.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "project"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importJSON = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = JSON.parse(text) as ProjectData;
      save(parsed);
    },
    [save],
  );

  const notifyEditingStart = useCallback((taskId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "editing-start", taskId }));
  }, []);
  const notifyEditingStop = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "editing-stop" }));
  }, []);

  const addMember = useCallback(
    async (username: string, newAccount?: { password: string; displayName: string }) => {
      await api.addMember(projectId, username, newAccount);
      await refreshMembers();
    },
    [projectId, refreshMembers],
  );
  const removeMember = useCallback(
    async (userId: string) => {
      await api.removeMember(projectId, userId);
      await refreshMembers();
    },
    [projectId, refreshMembers],
  );
  const promoteMember = useCallback(
    async (userId: string) => {
      await api.promoteMember(projectId, userId);
      await refreshMembers();
    },
    [projectId, refreshMembers],
  );
  const demoteMember = useCallback(
    async (userId: string) => {
      await api.demoteMember(projectId, userId);
      await refreshMembers();
    },
    [projectId, refreshMembers],
  );

  const renameProject = useCallback(
    (name: string) => {
      if (!dataRef.current) return;
      save({ ...dataRef.current, project: { ...dataRef.current.project, name } });
    },
    [save],
  );

  return {
    data,
    project,
    members: project?.members || ([] as ProjectMember[]),
    role: project?.role,
    loading,
    error,
    deleted,
    presence,
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
    renameProject,
  };
}
