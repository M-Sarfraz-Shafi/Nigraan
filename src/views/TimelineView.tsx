import { useEffect, useRef, useState } from "react";
import { S, ROW_H, DAY_W_DEFAULT } from "../styles";
import { addD, addWD, daysB, fmtDate, toDate, today } from "../domain/dates";
import { darken, lighten, readableText } from "../domain/color";
import { overlaps } from "../domain/overlap";
import { STATUS_COLORS } from "../domain/types";
import type { ComputedDates, ProjectData, ScheduledTask, Task } from "../domain/types";
import { CalHeader, DayCols, type ReleaseMarker } from "../components/Calendar";
import { ContextMenu } from "../components/ContextMenu";
import { Badge, ChevD, ChevR } from "../components/atoms";

interface Row {
  type: "ms" | "t";
  id: string;
  name: string;
  color: string;
  task?: Task;
  comp?: ComputedDates | null;
  isR?: boolean;
  ind?: number;
  isP?: boolean;
  hasChildren?: boolean;
  collapsed?: boolean;
  childCount?: number;
  doneCount?: number;
}

interface DragState {
  type: "resize" | "move" | "link";
  taskId: string;
  startX: number;
  origEst?: number;
  origStart?: string;
  /** For a group (parent) drag: each child's own start date at drag-start, shifted by the same delta. */
  childOrigStarts?: Record<string, string>;
}

interface CtxState {
  x: number;
  y: number;
  taskId: string;
  task?: Task;
}

export function TimelineView({
  data,
  scheduled,
  save,
  onEditTask,
  editingByTaskId,
}: {
  data: ProjectData;
  scheduled: ScheduledTask[];
  save: (d: ProjectData) => void;
  onEditTask: (t: Task) => void;
  editingByTaskId?: Record<string, string>;
}) {
  const rRef = useRef<HTMLDivElement>(null);
  const lRef = useRef<HTMLDivElement>(null);
  const [dayW, setDayW] = useState(DAY_W_DEFAULT);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dLinkTarget, setDLinkTarget] = useState<string | null>(null);
  const [dLinkPos, setDLinkPos] = useState<{ x: number; y: number } | null>(null);
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCollapse = (id: string) => setCollapsed((p) => ({ ...p, [id]: !p[id] }));
  const didDrag = useRef(false);
  const dRef = useRef(data);
  dRef.current = data;

  const sMap = Object.fromEntries(scheduled.map((t) => [t.id, t]));
  const hols = data.project.holidays || [];
  const projStart = toDate(data.project.startDate) || today();
  const targetRelease = toDate(data.project.targetReleaseDate || null);
  let tentativeRelease = projStart;
  scheduled.forEach((t) => {
    if (t.computed?.endDate) {
      const e = toDate(t.computed.endDate)!;
      if (e > tentativeRelease) tentativeRelease = e;
    }
  });
  // The visible range is padded well beyond project start / today / the release dates in
  // both directions, so dragging and browsing aren't boxed in by whatever the schedule
  // happens to compute right now.
  const earliestAnchor = [projStart, today()].reduce((a, b) => (b < a ? b : a));
  const latestAnchor = [tentativeRelease, today(), targetRelease].filter((d): d is Date => !!d).reduce((a, b) => (b > a ? b : a));
  const pStart = addD(earliestAnchor, -30);
  const pEnd = addD(latestAnchor, 45);
  const totD = daysB(pStart, pEnd) + 1;
  const days: Date[] = [];
  for (let i = 0; i < totD; i++) days.push(addD(pStart, i));
  const markers: ReleaseMarker[] = [{ date: tentativeRelease, color: "#f59e0b", label: "Tentative release" }];
  if (targetRelease) markers.push({ date: targetRelease, color: "#7c3aed", label: "Target release" });

  const rows: Row[] = [];
  data.milestones.forEach((ms) => {
    rows.push({ type: "ms", id: ms.id, name: ms.name, color: ms.color });
    data.tasks
      .filter((t) => t.milestoneId === ms.id && !t.parentId)
      .forEach((t) => {
        const sc = sMap[t.id];
        const children = data.tasks.filter((s) => s.parentId === t.id);
        const isCollapsed = !!collapsed[t.id];
        rows.push({
          type: "t",
          id: t.id,
          name: t.name,
          task: t,
          comp: sc?.computed,
          color: ms.color,
          isR: t.type === "research",
          ind: 0,
          isP: sc?.isParent,
          hasChildren: children.length > 0,
          collapsed: isCollapsed,
          childCount: children.length,
          doneCount: children.filter((c) => c.status === "done").length,
        });
        if (!isCollapsed) {
          children.forEach((sub) => {
            const ss = sMap[sub.id];
            rows.push({ type: "t", id: sub.id, name: sub.name, task: sub, comp: ss?.computed, color: ms.color, isR: sub.type === "research", ind: 1, isP: false });
          });
        }
      });
  });
  const rIdx: Record<string, number> = Object.fromEntries(rows.map((r, i) => [r.id + (r.type === "t" ? "t" : "m"), i]));
  const tRows = rows.filter((r) => r.type === "t");

  const gBar = (r: Row) => {
    if (!r.comp) return null;
    const si = daysB(pStart, toDate(r.comp.startDate)!);
    const ei = daysB(pStart, toDate(r.comp.endDate)!);
    const ri = rIdx[r.id + "t"];
    const l = si * dayW + 2;
    const w = Math.max((ei - si + 1) * dayW - 4, dayW - 4);
    const t = ri * ROW_H + 7;
    const h = ROW_H - 14;
    return { left: l, width: w, top: t, height: h, right: l + w, cy: t + h / 2 };
  };

  const hasLeaveOverlap = (task: Task | undefined, comp: ComputedDates | null | undefined) => {
    if (!task?.assignedTo || !comp) return false;
    const mem = data.project.teamMembers.find((m) => m.id === task.assignedTo);
    if (!mem?.leave?.length) return false;
    return mem.leave.some((l) => l.start <= comp.endDate && l.end >= comp.startDate);
  };

  const hasAssigneeOverlap = (task: Task | undefined, comp: ComputedDates | null | undefined) => {
    if (!task?.assignedTo || !comp) return false;
    const a = { start: comp.startDate, end: comp.endDate };
    return tRows.some(
      (other) =>
        other.id !== task.id &&
        !other.isP &&
        other.task?.assignedTo === task.assignedTo &&
        other.comp &&
        overlaps(a, { start: other.comp.startDate, end: other.comp.endDate }),
    );
  };

  // Land on today whenever the Timeline is opened, instead of the leftmost padding day.
  useEffect(() => {
    if (!rRef.current) return;
    const todayIdx = daysB(pStart, today());
    rRef.current.scrollLeft = Math.max(0, todayIdx * dayW - 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      didDrag.current = true;
      const dx = e.clientX - drag.startX;
      if (drag.type === "resize") {
        const extra = Math.round(dx / dayW);
        const ne = Math.max(1, (drag.origEst || 1) + extra);
        save({ ...dRef.current, tasks: dRef.current.tasks.map((t) => (t.id === drag.taskId ? { ...t, estimateDays: ne } : t)) });
      } else if (drag.type === "move") {
        const shift = Math.round(dx / dayW);
        if (drag.childOrigStarts) {
          // Group drag: shift every child by the same delta, skipping pinned ones.
          const starts = drag.childOrigStarts;
          save({
            ...dRef.current,
            tasks: dRef.current.tasks.map((t) => {
              const origStart = starts[t.id];
              if (!origStart || t.pinned) return t;
              return { ...t, manualStartDate: fmtDate(addD(toDate(origStart)!, shift)) };
            }),
          });
        } else {
          const ns = addD(toDate(drag.origStart!)!, shift);
          save({ ...dRef.current, tasks: dRef.current.tasks.map((t) => (t.id === drag.taskId ? { ...t, manualStartDate: fmtDate(ns), pinned: t.pinned } : t)) });
        }
      } else if (drag.type === "link") {
        const rect = rRef.current!.getBoundingClientRect();
        const cx = e.clientX - rect.left + rRef.current!.scrollLeft;
        const cy = e.clientY - rect.top + rRef.current!.scrollTop - 46;
        setDLinkPos({ x: cx, y: cy });
        const tri = Math.floor(cy / ROW_H);
        const tr = rows[tri];
        setDLinkTarget(tr && tr.type === "t" && tr.id !== drag.taskId ? tr.id : null);
      }
    };
    const onUp = () => {
      if (drag.type === "link" && dLinkTarget) {
        save({
          ...dRef.current,
          tasks: dRef.current.tasks.map((t) => {
            if (t.id === dLinkTarget) {
              const deps = [...(t.dependencies || [])];
              if (!deps.includes(drag.taskId)) deps.push(drag.taskId);
              return { ...t, dependencies: deps };
            }
            return t;
          }),
        });
      }
      setDrag(null);
      setDLinkTarget(null);
      setDLinkPos(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, dLinkTarget, dayW]);

  const sync = (src: "r" | "l") => {
    if (src === "r" && lRef.current && rRef.current) lRef.current.scrollTop = rRef.current.scrollTop;
    if (src === "l" && rRef.current && lRef.current) rRef.current.scrollTop = lRef.current.scrollTop;
  };
  const gm = (id: string | null) => data.project.teamMembers.find((m) => m.id === id);

  const arrows: { f: NonNullable<ReturnType<typeof gBar>>; t: NonNullable<ReturnType<typeof gBar>> }[] = [];
  tRows.forEach((r) => {
    if (!r.task || !r.comp) return;
    (r.task.dependencies || []).forEach((d) => {
      const dr = tRows.find((x) => x.id === d);
      if (!dr || !dr.comp) return;
      const f = gBar(dr);
      const t2 = gBar(r);
      if (f && t2) arrows.push({ f, t: t2 });
    });
  });

  const pinTask = (id: string) => {
    const sc = sMap[id];
    save({ ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, pinned: true, manualStartDate: sc?.computed?.startDate || t.manualStartDate } : t)) });
  };
  const unpinTask = (id: string) => save({ ...data, tasks: data.tasks.map((t) => (t.id === id ? { ...t, pinned: false } : t)) });
  const delTask = (id: string) => {
    const cids = data.tasks.filter((t) => t.parentId === id).map((t) => t.id);
    const rm = new Set([id, ...cids]);
    save({ ...data, tasks: data.tasks.filter((t) => !rm.has(t.id)).map((t) => ({ ...t, dependencies: (t.dependencies || []).filter((d) => !rm.has(d)) })) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }} onClick={() => ctx && setCtx(null)}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${S.border}`, background: "#fff" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: S.textSec }}>Zoom</span>
        <input type="range" min={16} max={52} value={dayW} onChange={(e) => setDayW(+e.target.value)} style={{ width: 120, accentColor: S.primary }} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: S.textMuted }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} /> Tentative
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#7c3aed", marginLeft: 8 }} /> Target
        </div>
        <span style={{ fontSize: 11, color: S.textMuted, marginLeft: 16 }}>Drag to move · Right edge to resize · ● to link · Right-click for menu</span>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div ref={lRef} style={{ width: 220, flexShrink: 0, overflowY: "auto", overflowX: "hidden", borderRight: `1px solid ${S.border}`, background: "#fff", position: "relative" }} onScroll={() => sync("l")}>
          <div style={{ height: 46 }} />
          {rows.map((r) => (
            <div key={r.id + r.type} style={{ height: ROW_H, display: "flex", alignItems: "center", borderBottom: `1px solid ${S.borderLight}` }}>
              {r.type === "ms" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", fontWeight: 700, fontSize: 11, color: r.color, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 3, background: r.color }} />
                  {r.name}
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    paddingLeft: r.ind ? 32 : 16,
                    fontSize: 12,
                    color: S.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: "pointer",
                    fontWeight: r.isP ? 700 : r.ind ? 400 : 500,
                  }}
                  onClick={() => r.task && onEditTask(r.task)}
                >
                  {r.hasChildren && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapse(r.id);
                      }}
                      style={{ cursor: "pointer", display: "flex", flexShrink: 0, color: S.textSec }}
                    >
                      {r.collapsed ? <ChevR /> : <ChevD />}
                    </span>
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                  {r.isR && <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 700, marginLeft: 3 }}>R</span>}
                  {r.task?.pinned && <span style={{ fontSize: 9, marginLeft: 2 }}>📌</span>}
                  {r.hasChildren && (
                    <Badge color={r.doneCount === r.childCount ? "#16a34a" : S.textSec}>
                      {r.doneCount}/{r.childCount}
                    </Badge>
                  )}
                  {editingByTaskId?.[r.id] && (
                    <span
                      style={{ fontSize: 9, fontWeight: 600, color: "#b45309", background: "#fef3c7", borderRadius: 20, padding: "1px 5px", flexShrink: 0 }}
                      title={`${editingByTaskId[r.id]} is currently editing this task`}
                    >
                      👤 editing
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {rows.map((r, i) => {
            if (r.type !== "t" || !r.hasChildren || r.collapsed || !r.childCount) return null;
            // Group connector: a spine alongside this parent's children, tying them
            // visually to the summary row above (in place of a second bar over the bars).
            return (
              <div
                key={r.id + "-connector"}
                style={{
                  position: "absolute",
                  left: 21,
                  top: 46 + (i + 1) * ROW_H,
                  width: 2,
                  height: r.childCount * ROW_H,
                  background: r.color + "55",
                  pointerEvents: "none",
                }}
              />
            );
          })}
        </div>
        <div ref={rRef} style={{ flex: 1, overflow: "auto", background: "#fafbfc" }} onScroll={() => sync("r")}>
          <CalHeader days={days} dayW={dayW} holidays={hols} markers={markers} />
          <div style={{ width: totD * dayW, position: "relative", minHeight: rows.length * ROW_H }}>
            <DayCols days={days} dayW={dayW} holidays={hols} markers={markers} />
            {rows.map((r, ri) =>
              r.type === "ms" ? (
                <div key={r.id + "bg"} style={{ position: "absolute", left: 0, right: 0, top: ri * ROW_H, height: ROW_H, background: "#f3f4f6", borderBottom: `1px solid ${S.borderLight}` }} />
              ) : null,
            )}
            <svg style={{ position: "absolute", top: 0, left: 0, width: totD * dayW, height: rows.length * ROW_H, zIndex: 4, pointerEvents: "none" }}>
              <defs>
                <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0,8 3,0 6" fill="#6366f1" opacity="0.6" />
                </marker>
              </defs>
              {arrows.map((a, i) => {
                const fx = a.f.right;
                const fy = a.f.cy;
                const tx = a.t.left;
                const ty = a.t.cy;
                const mx = fx + 20;
                return (
                  <path
                    key={i}
                    d={fy === ty ? `M${fx},${fy}L${tx},${ty}` : `M${fx},${fy}C${mx},${fy} ${mx},${ty} ${tx},${ty}`}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="1.5"
                    markerEnd="url(#ah)"
                    opacity="0.5"
                  />
                );
              })}
              {drag?.type === "link" &&
                dLinkPos &&
                (() => {
                  const fr = tRows.find((r) => r.id === drag.taskId);
                  const g = fr ? gBar(fr) : null;
                  return g ? <line x1={g.right} y1={g.cy} x2={dLinkPos.x} y2={dLinkPos.y} stroke={S.primary} strokeWidth="2" strokeDasharray="6,3" opacity="0.7" /> : null;
                })()}
            </svg>
            {rows.map((r, ri) => {
              if (r.type !== "t") return null;
              const g = gBar(r);
              if (!g) return <div key={r.id + "e"} style={{ position: "absolute", top: ri * ROW_H, left: 0, right: 0, height: ROW_H, borderBottom: `1px solid ${S.borderLight}` }} />;
              const isNP = r.task?.status === "not_pursuing";
              const mem = gm(r.task?.assignedTo ?? null);
              const isLT = dLinkTarget === r.id;
              const leaveOverlap = hasLeaveOverlap(r.task, r.comp);
              // Parent/summary rows trivially "overlap" their own children — not a real conflict.
              const assigneeOverlap = !r.isP && hasAssigneeOverlap(r.task, r.comp);
              // Color comes from status (not the milestone), so it's consistent across every
              // status combination. Subtasks render in a lighter tint of that status color,
              // top-level tasks (and the parent/summary rollup) in a darker one — the
              // hierarchy is legible from shade alone, the status from hue alone.
              const statusColor = STATUS_COLORS[r.task?.status || "not_started"];
              const base = r.ind ? lighten(statusColor, 0.4) : darken(statusColor, 0.16);
              const textColor = readableText(base);
              // The portion of a task beyond its original estimate is flagged with a light
              // orange stripe, so scope creep is visible directly on the bar without fighting
              // the status color underneath it.
              const origEstDays = r.task?.originalEstimateDays;
              const curEstDays = r.task?.estimateDays;
              let overrunLeftPx: number | null = null;
              if (!r.isP && r.comp && origEstDays && curEstDays && curEstDays > origEstDays) {
                const boundary = addWD(toDate(r.comp.startDate), origEstDays, hols, mem);
                if (boundary) overrunLeftPx = (daysB(pStart, boundary) + 1) * dayW;
              }
              // A parent/summary bar is a rollup, not its own estimated task, but it should
              // still flag that at least one of its children has overrun its estimate.
              const anyChildOverrun = r.isP && data.tasks.some((c) => c.parentId === r.id && (c.estimateDays || 0) > (c.originalEstimateDays || c.estimateDays || 0));
              return (
                <div key={r.id + "bar"} style={{ position: "absolute", top: ri * ROW_H, left: 0, right: 0, height: ROW_H, borderBottom: `1px solid ${S.borderLight}` }}>
                  {r.isP ? (
                    // Summary/parent bar: like a task bar, it reacts to its own status (turns
                    // green if marked done, etc). A subtle highlight shows the done-proportion
                    // of its children, and the task name is written on it.
                    <div
                      style={{
                        position: "absolute",
                        left: g.left,
                        top: 7,
                        height: ROW_H - 14,
                        width: g.width,
                        borderRadius: 7,
                        background: `linear-gradient(135deg,${base},${darken(base, 0.18)})`,
                        opacity: isNP ? 0.6 : 1,
                        border: "1px solid rgba(255,255,255,0.25)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                        cursor: "grab",
                        zIndex: 3,
                        display: "flex",
                        alignItems: "center",
                        overflow: "hidden",
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        didDrag.current = false;
                        const childOrigStarts: Record<string, string> = {};
                        data.tasks
                          .filter((c) => c.parentId === r.id)
                          .forEach((c) => {
                            const start = sMap[c.id]?.computed?.startDate;
                            if (start) childOrigStarts[c.id] = start;
                          });
                        setDrag({ type: "move", taskId: r.id, startX: e.clientX, childOrigStarts });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtx({ x: e.clientX, y: e.clientY, taskId: r.id, task: r.task });
                      }}
                      onClick={() => {
                        if (!didDrag.current && r.task) onEditTask(r.task);
                      }}
                      title={`${r.name}${r.comp ? `\n${r.comp.startDate} → ${r.comp.endDate}` : ""}`}
                    >
                      {/* Done-proportion highlight, painted under the label. */}
                      {!!r.childCount && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${((r.doneCount || 0) / r.childCount) * 100}%`,
                            background: "rgba(255,255,255,0.22)",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                      <span style={{ fontSize: 10, fontWeight: 700, color: textColor, padding: "0 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, pointerEvents: "none", zIndex: 1 }}>
                        {r.name}
                      </span>
                      {!!r.childCount && g.width > 40 && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: textColor, opacity: 0.85, marginRight: anyChildOverrun ? 4 : 8, pointerEvents: "none", zIndex: 1 }}>
                          {r.doneCount}/{r.childCount}
                        </span>
                      )}
                      {anyChildOverrun && g.width > 30 && (
                        <span style={{ fontSize: 9, marginRight: 8, pointerEvents: "none", zIndex: 1 }} title="At least one subtask has run over its original estimate">
                          🔶
                        </span>
                      )}
                      <div
                        style={{ position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: darken(base, 0.3), border: "2px solid #fff", cursor: "crosshair", zIndex: 7, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDrag({ type: "link", taskId: r.id, startX: e.clientX });
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        left: g.left,
                        top: 7,
                        height: ROW_H - 14,
                        width: g.width,
                        borderRadius: 7,
                        background: `linear-gradient(135deg,${base},${darken(base, 0.12)})`,
                        opacity: isNP ? 0.6 : 1,
                        border: isLT ? `2px solid ${S.primary}` : r.isR ? "2px dashed rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.2)",
                        boxShadow: isLT ? `0 0 12px ${S.primary}44` : assigneeOverlap ? "0 0 0 2px #f59e0b, 0 1px 3px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.1)",
                        cursor: r.task?.pinned ? "not-allowed" : "grab",
                        zIndex: 3,
                        display: "flex",
                        alignItems: "center",
                        overflow: "hidden",
                      }}
                      onMouseDown={(e) => {
                        if (e.button !== 0 || r.task?.pinned) return;
                        e.preventDefault();
                        didDrag.current = false;
                        setDrag({ type: "move", taskId: r.id, startX: e.clientX, origStart: sMap[r.id]?.computed?.startDate || data.project.startDate });
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCtx({ x: e.clientX, y: e.clientY, taskId: r.id, task: r.task });
                      }}
                      onClick={() => {
                        if (!didDrag.current && r.task) onEditTask(r.task);
                      }}
                    >
                      {/* Portion of the bar beyond the original estimate — a soft light-orange
                          stripe flags scope creep without fighting the status color underneath. */}
                      {overrunLeftPx !== null && (
                        <div
                          style={{
                            position: "absolute",
                            left: Math.max(0, overrunLeftPx - g.left),
                            right: 0,
                            top: 0,
                            bottom: 0,
                            background: "repeating-linear-gradient(45deg,#fed7aa,#fed7aa 6px,#ffedd5 6px,#ffedd5 12px)",
                            opacity: 0.85,
                            pointerEvents: "none",
                          }}
                          title={`${(curEstDays || 0) - (origEstDays || 0)}d over the original ${origEstDays}d estimate`}
                        />
                      )}
                      <span style={{ fontSize: 10, fontWeight: 600, color: textColor, padding: "0 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, pointerEvents: "none", zIndex: 1 }}>
                        {r.name}
                      </span>
                      {r.task?.pinned && g.width > 30 && <span style={{ fontSize: 9, marginRight: 4, pointerEvents: "none", zIndex: 1 }}>📌</span>}
                      {r.task?.autoSchedule === false && g.width > 30 && (
                        <span style={{ fontSize: 9, marginRight: 4, pointerEvents: "none", zIndex: 1 }} title="Scheduler disabled">
                          ⏸
                        </span>
                      )}
                      {leaveOverlap && g.width > 30 && (
                        <span style={{ fontSize: 9, marginRight: 4, pointerEvents: "none", zIndex: 1 }} title="Member has leave during this task">
                          🏖️
                        </span>
                      )}
                      {assigneeOverlap && g.width > 30 && (
                        <span style={{ fontSize: 9, marginRight: 4, pointerEvents: "none", zIndex: 1 }} title="This person is scheduled on another task at the same time">
                          ⚠️
                        </span>
                      )}
                      <div
                        style={{ position: "absolute", right: -6, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, borderRadius: "50%", background: "#475569", border: "2px solid #fff", cursor: "crosshair", zIndex: 7, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDrag({ type: "link", taskId: r.id, startX: e.clientX });
                        }}
                      />
                      <div
                        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", borderRadius: "0 6px 6px 0", background: "rgba(255,255,255,0.15)", zIndex: 6 }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDrag({ type: "resize", taskId: r.id, startX: e.clientX, origEst: r.task?.estimateDays || 1 });
                        }}
                      />
                    </div>
                  )}
                  {mem && <div style={{ position: "absolute", left: g.left + g.width + 20, top: 14, fontSize: 10, color: S.textMuted, whiteSpace: "nowrap", zIndex: 2 }}>{mem.name}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            ctx.task?.autoSchedule === false
              ? {
                  icon: "▶",
                  label: "Enable scheduler",
                  action: () => save({ ...data, tasks: data.tasks.map((t) => (t.id === ctx.taskId ? { ...t, autoSchedule: true } : t)) }),
                }
              : {
                  icon: "⏸",
                  label: "Disable scheduler (raw mode)",
                  action: () => {
                    const sc = sMap[ctx.taskId];
                    save({ ...data, tasks: data.tasks.map((t) => (t.id === ctx.taskId ? { ...t, autoSchedule: false, manualStartDate: sc?.computed?.startDate || t.manualStartDate || fmtDate(today()) } : t)) });
                  },
                },
            { divider: true },
            ctx.task?.pinned
              ? { icon: "🔓", label: "Unpin (unlock to drag)", action: () => unpinTask(ctx.taskId) }
              : { icon: "📌", label: "Pin here (lock position)", action: () => pinTask(ctx.taskId) },
            ctx.task?.manualStartDate
              ? {
                  icon: "↩️",
                  label: "Reset position",
                  action: () => save({ ...data, tasks: data.tasks.map((t) => (t.id === ctx.taskId ? { ...t, manualStartDate: null, pinned: false } : t)) }),
                }
              : null,
            { divider: true },
            { icon: "✏️", label: "Edit", action: () => ctx.task && onEditTask(ctx.task) },
            { icon: "🗑️", label: "Delete", danger: true, action: () => delTask(ctx.taskId) },
          ].filter((x): x is NonNullable<typeof x> => x !== null)}
        />
      )}
    </div>
  );
}
