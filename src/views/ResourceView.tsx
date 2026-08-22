import { useState } from "react";
import { S, ROW_H } from "../styles";
import { addD, daysB, fmtDate, toDate, today } from "../domain/dates";
import { hasOverlapWithOthers, packLanes } from "../domain/overlap";
import type { ProjectData, ScheduledTask } from "../domain/types";
import { CalHeader, DayCols } from "../components/Calendar";
import { Btn, Input } from "../components/atoms";

export function ResourceView({ data, scheduled, save }: { data: ProjectData; scheduled: ScheduledTask[]; save: (d: ProjectData) => void }) {
  const hols = data.project.holidays || [];
  const pStart = toDate(data.project.startDate) || today();
  let pEnd = addD(pStart, 30);
  scheduled.forEach((t) => {
    if (t.computed?.endDate) {
      const e = toDate(t.computed.endDate)!;
      if (e > pEnd) pEnd = e;
    }
  });
  pEnd = addD(pEnd, 7);
  const totD = daysB(pStart, pEnd) + 1;
  const days: Date[] = [];
  for (let i = 0; i < totD; i++) days.push(addD(pStart, i));
  const dayW = 24;
  const [addLeaveFor, setAddLeaveFor] = useState<string | null>(null);
  const [lStart, setLStart] = useState("");
  const [lEnd, setLEnd] = useState("");
  const [lName, setLName] = useState("");

  const mTasks: Record<string, ScheduledTask[]> = {};
  data.project.teamMembers.forEach((m) => {
    mTasks[m.id] = [];
  });
  scheduled.forEach((t) => {
    // Parent/summary tasks are excluded here: their dates are just an aggregate
    // of their children (already shown individually), not a real work item.
    if (t.assignedTo && t.computed && !t.isParent && mTasks[t.assignedTo]) mTasks[t.assignedTo].push(t);
  });
  const gMs = (id: string) => data.milestones.find((m) => m.id === id);

  const addLeave = () => {
    if (!addLeaveFor || !lStart || !lEnd) return;
    const mems = data.project.teamMembers.map((m) => {
      if (m.id !== addLeaveFor) return m;
      return { ...m, leave: [...(m.leave || []), { start: lStart, end: lEnd, name: lName.trim() || "Leave" }].sort((a, b) => a.start.localeCompare(b.start)) };
    });
    save({ ...data, project: { ...data.project, teamMembers: mems } });
    setAddLeaveFor(null);
    setLStart("");
    setLEnd("");
    setLName("");
  };
  const rmLeave = (mid: string, idx: number) => {
    const mems = data.project.teamMembers.map((m) => {
      if (m.id !== mid) return m;
      const lv = [...(m.leave || [])];
      lv.splice(idx, 1);
      return { ...m, leave: lv };
    });
    save({ ...data, project: { ...data.project, teamMembers: mems } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>Resource Allocation</h2>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ minWidth: totD * dayW + 200 }}>
          <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ width: 200, flexShrink: 0, background: "#fff" }} />
            <CalHeader days={days} dayW={dayW} holidays={hols} />
          </div>
          {data.project.teamMembers.map((m) => {
            const tasks = (mTasks[m.id] || []).filter((t) => t.computed).sort((a, b) => a.computed!.startDate.localeCompare(b.computed!.startDate));
            const intervals = tasks.map((t) => ({ start: t.computed!.startDate, end: t.computed!.endDate }));
            const taskLanes = packLanes(intervals);
            const overlapFlags = hasOverlapWithOthers(intervals);
            const conflictCount = overlapFlags.filter(Boolean).length;
            const laneCount = taskLanes.length ? Math.max(...taskLanes) + 1 : 0;
            const lastEnd = tasks.length ? tasks.reduce((mx, t) => { const e = toDate(t.computed!.endDate)!; return e > mx ? e : mx; }, toDate(tasks[0].computed!.endDate)!) : null;
            const leaveBlocks = (m.leave || []).map((l, i) => ({ ...l, idx: i, si: daysB(pStart, toDate(l.start)!), ei: daysB(pStart, toDate(l.end)!) }));
            const laneH = Math.max((laneCount + 1) * (ROW_H - 4) + 8, ROW_H + 8);
            return (
              <div key={m.id} style={{ borderBottom: `1px solid ${S.border}` }}>
                <div style={{ display: "flex" }}>
                  <div style={{ width: 200, flexShrink: 0, padding: "10px 16px", background: "#f9fafb", borderRight: `1px solid ${S.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${m.color},${m.color}aa)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                        {m.name[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{m.name}</div>
                        <div style={{ fontSize: 10, color: S.textMuted }}>
                          {tasks.length} tasks{lastEnd ? ` · Free ${fmtDate(lastEnd)}` : ""}
                        </div>
                      </div>
                    </div>
                    {conflictCount > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#b45309", background: "#fef3c7", borderRadius: 4, padding: "2px 6px", marginBottom: 4, display: "inline-block" }}>
                        ⚠ {conflictCount} overlapping task{conflictCount > 1 ? "s" : ""}
                      </div>
                    )}
                    <button onClick={() => setAddLeaveFor(addLeaveFor === m.id ? null : m.id)} style={{ fontSize: 11, color: "#ef4444", border: "none", background: "none", cursor: "pointer", fontWeight: 600, padding: "2px 0" }}>
                      {addLeaveFor === m.id ? "Cancel" : "+ Add Leave"}
                    </button>
                    {(m.leave || []).map((l, li) => (
                      <div key={li} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "#991b1b", background: "#fef2f2", borderRadius: 4, padding: "2px 6px", marginTop: 3 }}>
                        <span>
                          {l.start} → {l.end} {l.name}
                        </span>
                        <span onClick={() => rmLeave(m.id, li)} style={{ cursor: "pointer", fontWeight: 700 }}>
                          ×
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ position: "relative", width: totD * dayW, height: laneH }}>
                    <DayCols days={days} dayW={dayW} holidays={hols} />
                    {leaveBlocks.map((lb, i) => (
                      <div
                        key={"lv" + i}
                        style={{ position: "absolute", left: lb.si * dayW, top: 0, bottom: 0, width: Math.max((lb.ei - lb.si + 1) * dayW, dayW), background: "repeating-linear-gradient(135deg,#fecaca44,#fecaca44 4px,transparent 4px,transparent 8px)", zIndex: 1, borderLeft: "2px solid #fca5a5" }}
                      >
                        <span style={{ fontSize: 9, color: "#dc2626", fontWeight: 600, padding: "2px 4px", display: "block" }}>{lb.name}</span>
                      </div>
                    ))}
                    {tasks.map((t, ti) => {
                      const c = t.computed!;
                      const si = daysB(pStart, toDate(c.startDate)!);
                      const ei = daysB(pStart, toDate(c.endDate)!);
                      const ms = gMs(t.milestoneId);
                      const conflict = overlapFlags[ti];
                      return (
                        <div
                          key={t.id}
                          style={{
                            position: "absolute",
                            left: si * dayW + 1,
                            top: 4 + taskLanes[ti] * (ROW_H - 4),
                            width: Math.max((ei - si + 1) * dayW - 2, dayW - 2),
                            height: ROW_H - 12,
                            borderRadius: 5,
                            background: ms?.color || "#6366f1",
                            opacity: t.status === "done" ? 0.5 : 1,
                            display: "flex",
                            alignItems: "center",
                            padding: "0 6px",
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#fff",
                            overflow: "hidden",
                            zIndex: 2,
                            boxShadow: conflict ? "0 0 0 2px #f59e0b, 0 1px 2px rgba(0,0,0,0.1)" : "0 1px 2px rgba(0,0,0,0.1)",
                          }}
                          title={`${t.name}\n${c.startDate} → ${c.endDate}${conflict ? "\n⚠ overlaps another task for this person" : ""}`}
                        >
                          {conflict && <span style={{ marginRight: 3 }}>⚠</span>}
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {addLeaveFor === m.id && (
                  <div style={{ display: "flex", gap: 8, padding: "8px 16px", background: "#fef2f2", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b" }}>Leave for {m.name}:</span>
                    <Input type="date" value={lStart} onChange={(e) => setLStart(e.target.value)} style={{ flex: "0 0 140px", fontSize: 12 }} />
                    <span style={{ fontSize: 12, color: "#991b1b" }}>to</span>
                    <Input type="date" value={lEnd} onChange={(e) => setLEnd(e.target.value)} style={{ flex: "0 0 140px", fontSize: 12 }} />
                    <Input value={lName} onChange={(e) => setLName(e.target.value)} placeholder="Reason" onKeyDown={(e) => e.key === "Enter" && addLeave()} style={{ flex: 1, minWidth: 80, fontSize: 12 }} />
                    <Btn onClick={addLeave} style={{ background: "#ef4444", fontSize: 12 }}>
                      Add
                    </Btn>
                  </div>
                )}
              </div>
            );
          })}
          {data.project.teamMembers.length === 0 && <div style={{ padding: 40, textAlign: "center", color: S.textMuted, fontSize: 14 }}>No team members.</div>}
        </div>
      </div>
    </div>
  );
}
