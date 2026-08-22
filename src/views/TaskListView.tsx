import { useState } from "react";
import { S } from "../styles";
import { fmtDate, today, uid } from "../domain/dates";
import { MS_COLORS, STATUS_COLORS, STATUS_LABELS } from "../domain/types";
import type { ProjectData, ScheduledTask, Task } from "../domain/types";
import { Badge, Btn, Card, ChevD, ChevR, Edit, IconBtn, Input, Trash } from "../components/atoms";

export function TaskListView({
  data,
  scheduled,
  save,
  onEditTask,
  editingByTaskId,
  currentUserName,
}: {
  data: ProjectData;
  scheduled: ScheduledTask[];
  save: (d: ProjectData) => void;
  onEditTask: (t: Task) => void;
  editingByTaskId?: Record<string, string>;
  currentUserName: string;
}) {
  const [col, setCol] = useState<Record<string, boolean>>({});
  const [ntName, setNtName] = useState<Record<string, string>>({});
  const [ntEst, setNtEst] = useState<Record<string, string>>({});
  const [nMs, setNMs] = useState("");
  const toggle = (id: string) => setCol((p) => ({ ...p, [id]: !p[id] }));

  const addMilestone = () => {
    if (!nMs.trim()) return;
    save({
      ...data,
      milestones: [
        ...data.milestones,
        { id: uid(), name: nMs.trim(), color: MS_COLORS[data.milestones.length % MS_COLORS.length], createdBy: currentUserName },
      ],
    });
    setNMs("");
  };
  const removeMilestone = (id: string, name: string) => {
    if (!window.confirm(`Delete milestone "${name}"? This also deletes all of its tasks.`)) return;
    save({ ...data, milestones: data.milestones.filter((m) => m.id !== id), tasks: data.tasks.filter((t) => t.milestoneId !== id) });
  };

  const addTask = (mid: string, pid: string | null = null) => {
    const k = mid + (pid || "");
    const name = ntName[k] || "";
    const est = parseInt(ntEst[k] || "", 10);
    if (!name.trim() || !est || est < 1) return;
    save({
      ...data,
      tasks: [
        ...data.tasks,
        {
          id: uid(),
          milestoneId: mid,
          parentId: pid,
          name: name.trim(),
          type: "definitive",
          estimateDays: est,
          originalEstimateDays: est,
          assignedTo: null,
          status: "not_started",
          dependencies: [],
          notes: "",
          actualStart: null,
          actualEnd: null,
          manualStartDate: fmtDate(today()),
          pinned: false,
          autoSchedule: true,
        },
      ],
    });
    setNtName((p) => ({ ...p, [k]: "" }));
    setNtEst((p) => ({ ...p, [k]: "" }));
  };
  const canAdd = (k: string) => !!(ntName[k] || "").trim() && parseInt(ntEst[k] || "", 10) >= 1;

  const tByMs: Record<string, Task[]> = {};
  data.milestones.forEach((m) => {
    tByMs[m.id] = [];
  });
  const sMap = Object.fromEntries(scheduled.map((t) => [t.id, t]));
  data.tasks.forEach((t) => {
    if (tByMs[t.milestoneId]) tByMs[t.milestoneId].push(t);
  });
  const gm = (id: string | null) => data.project.teamMembers.find((m) => m.id === id);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <Card style={{ padding: 14, marginBottom: 24, display: "flex", gap: 8 }}>
        <Input value={nMs} onChange={(e) => setNMs(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMilestone()} placeholder="New milestone name..." />
        <Btn onClick={addMilestone}>+ Milestone</Btn>
      </Card>
      {data.milestones.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: S.textMuted }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No milestones yet</p>
          <p style={{ fontSize: 13 }}>Add one above to get started</p>
        </div>
      )}
      {data.milestones.map((ms) => {
        const tasks = tByMs[ms.id] || [];
        const top = tasks.filter((t) => !t.parentId);
        const ch = (pid: string) => tasks.filter((t) => t.parentId === pid);
        return (
          <div key={ms.id} style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: 4, background: ms.color }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: S.text }}>{ms.name}</span>
              <span style={{ fontSize: 12, color: S.textMuted }}>
                {tasks.filter((t) => t.status === "done").length}/{tasks.length}
              </span>
              {ms.createdBy && <span style={{ fontSize: 11, color: S.textMuted }}>· by {ms.createdBy}</span>}
              <div style={{ flex: 1 }} />
              <IconBtn onClick={() => removeMilestone(ms.id, ms.name)}>
                <Trash />
              </IconBtn>
            </div>
            <Card>
              <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                    {["Task", "Category", "Est.", "Actual Days", "Assigned", "Status", "Comments / Reason", ""].map((h, i) => (
                      <th key={i} style={{ padding: "10px 14px", fontWeight: 600, color: S.textSec, textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {top.map((t) => {
                    const subs = ch(t.id);
                    const sc = sMap[t.id];
                    const isO = !col[t.id];
                    const Row = ({ task, indent, sc2 }: { task: Task; indent: boolean; sc2?: ScheduledTask }) => (
                      <tr
                        key={task.id}
                        onClick={() => onEditTask(task)}
                        style={{ borderBottom: `1px solid ${S.borderLight}`, cursor: "pointer", background: indent ? "#fafbfc" : "transparent" }}
                      >
                        <td style={{ padding: "8px 14px", paddingLeft: indent ? 40 : 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {!indent && subs.length > 0 && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle(t.id);
                                }}
                                style={{ cursor: "pointer", display: "flex" }}
                              >
                                {isO ? <ChevD /> : <ChevR />}
                              </span>
                            )}
                            {!indent && subs.length === 0 && <span style={{ width: 13 }} />}
                            <span style={{ color: S.text, fontWeight: indent ? 400 : 500 }}>{task.name}</span>
                            {task.pinned && <span style={{ fontSize: 10 }}>📌</span>}
                            {(task.dependencies || []).length > 0 && (
                              <span style={{ fontSize: 10, color: S.textMuted }}>🔗{task.dependencies.length}</span>
                            )}
                            {editingByTaskId?.[task.id] && (
                              <span
                                style={{ fontSize: 10, fontWeight: 600, color: "#b45309", background: "#fef3c7", borderRadius: 20, padding: "1px 6px" }}
                                title={`${editingByTaskId[task.id]} is currently editing this task`}
                              >
                                👤 {editingByTaskId[task.id]} editing
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <Badge color={task.type === "research" ? "#f59e0b" : S.textSec}>{task.type === "research" ? "Research" : "Definitive"}</Badge>
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: 12, color: S.textSec }}>
                          {sc2?.isParent ? "—" : task.originalEstimateDays + "d"}
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: 12 }}>
                          {sc2?.isParent ? (
                            "—"
                          ) : (
                            <span style={{ color: task.estimateDays > task.originalEstimateDays ? "#dc2626" : S.textSec, fontWeight: task.estimateDays > task.originalEstimateDays ? 700 : 400 }}>
                              {task.estimateDays}d
                              {task.estimateDays > task.originalEstimateDays && ` (+${task.estimateDays - task.originalEstimateDays})`}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          {task.assignedTo ? (
                            <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: gm(task.assignedTo)?.color || "#ccc", display: "inline-block" }} />
                              {gm(task.assignedTo)?.name}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <Badge color={STATUS_COLORS[task.status]}>{STATUS_LABELS[task.status]}</Badge>
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: 12, color: S.textSec, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={task.notes || ""}>
                          {task.notes || <span style={{ color: "#d1d5db" }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <IconBtn
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditTask(task);
                            }}
                          >
                            <Edit />
                          </IconBtn>
                        </td>
                      </tr>
                    );
                    return [
                      <Row key={t.id} task={t} indent={false} sc2={sc} />,
                      ...(isO ? subs.map((s) => <Row key={s.id} task={s} indent={true} sc2={sMap[s.id]} />) : []),
                      ...(isO
                        ? [
                            <tr key={t.id + "-a"} style={{ borderBottom: `1px solid ${S.borderLight}`, background: "#fafbfc" }}>
                              <td colSpan={8} style={{ padding: "4px 14px", paddingLeft: 40 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <input
                                    value={ntName[ms.id + t.id] || ""}
                                    onChange={(e) => setNtName((p) => ({ ...p, [ms.id + t.id]: e.target.value }))}
                                    onKeyDown={(e) => e.key === "Enter" && canAdd(ms.id + t.id) && addTask(ms.id, t.id)}
                                    placeholder="Add subtask..."
                                    style={{ flex: 1, border: "none", background: "transparent", fontSize: 12, outline: "none", color: S.textSec, padding: "4px 0" }}
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    value={ntEst[ms.id + t.id] || ""}
                                    onChange={(e) => setNtEst((p) => ({ ...p, [ms.id + t.id]: e.target.value }))}
                                    onKeyDown={(e) => e.key === "Enter" && canAdd(ms.id + t.id) && addTask(ms.id, t.id)}
                                    placeholder="Est. days*"
                                    style={{ width: 90, border: `1px solid ${S.borderLight}`, borderRadius: 6, background: "#fff", fontSize: 12, outline: "none", color: S.textSec, padding: "4px 8px" }}
                                  />
                                  <button
                                    onClick={() => addTask(ms.id, t.id)}
                                    disabled={!canAdd(ms.id + t.id)}
                                    style={{ fontSize: 12, color: S.primary, border: "none", background: "none", cursor: canAdd(ms.id + t.id) ? "pointer" : "not-allowed", fontWeight: 600, opacity: canAdd(ms.id + t.id) ? 1 : 0.4 }}
                                  >
                                    + Add
                                  </button>
                                </div>
                              </td>
                            </tr>,
                          ]
                        : []),
                    ];
                  })}
                  <tr style={{ borderTop: `1px solid ${S.border}` }}>
                    <td colSpan={8} style={{ padding: "8px 14px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          value={ntName[ms.id] || ""}
                          onChange={(e) => setNtName((p) => ({ ...p, [ms.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && canAdd(ms.id) && addTask(ms.id)}
                          placeholder="Add task..."
                          style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, outline: "none", color: S.text, padding: "4px 0" }}
                        />
                        <input
                          type="number"
                          min={1}
                          value={ntEst[ms.id] || ""}
                          onChange={(e) => setNtEst((p) => ({ ...p, [ms.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && canAdd(ms.id) && addTask(ms.id)}
                          placeholder="Est. days*"
                          style={{ width: 100, border: `1px solid ${S.border}`, borderRadius: 6, background: "#fff", fontSize: 13, outline: "none", color: S.text, padding: "4px 8px" }}
                        />
                        <button
                          onClick={() => addTask(ms.id)}
                          disabled={!canAdd(ms.id)}
                          style={{ fontSize: 13, color: S.primary, border: "none", background: "none", cursor: canAdd(ms.id) ? "pointer" : "not-allowed", fontWeight: 600, opacity: canAdd(ms.id) ? 1 : 0.4 }}
                        >
                          + Add
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
