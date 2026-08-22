import { useState } from "react";
import { S } from "../styles";
import { addD, fmtDate, isHol, isWE, toDate } from "../domain/dates";
import { wouldCreateCycle } from "../domain/schedule";
import { STATUS_OPTIONS, STATUS_LABELS } from "../domain/types";
import type { ProjectData, ScheduledTask, Task } from "../domain/types";
import { Btn, IconBtn, Input, Label, Select, XIcon } from "./atoms";

export function EditPanel({
  task,
  data,
  scheduled,
  onSave,
  onClose,
  onDelete,
  onToast,
}: {
  task: Task;
  data: ProjectData;
  scheduled: ScheduledTask[];
  onSave: (t: Task) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToast: (msg: string) => void;
}) {
  const [form, setForm] = useState<Task>({ ...task });
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setForm((p) => ({ ...p, [k]: v }));
  const sc = scheduled.find((s) => s.id === task.id);
  const depOpts = data.tasks
    .filter((t) => t.id !== task.id)
    .map((t) => ({
      value: t.id,
      label: `${data.milestones.find((m) => m.id === t.milestoneId)?.name || ""} → ${t.name}`,
    }));

  const toggleDep = (depId: string) => {
    const deps = form.dependencies || [];
    if (deps.includes(depId)) {
      setForm((p) => ({
        ...p,
        dependencies: deps.filter((d) => d !== depId),
        manualStartDate: sc?.computed?.startDate || p.manualStartDate,
      }));
      return;
    }
    if (wouldCreateCycle(data.tasks, task.id, depId)) {
      onToast("That would create a circular dependency — not added.");
      return;
    }
    set("dependencies", [...deps, depId]);
  };

  const computedStart = sc?.computed?.startDate || form.manualStartDate || "";
  const computedEnd = sc?.computed?.endDate || "";
  const onStartChange = (v: string) => set("manualStartDate", v);
  const onEndChange = (v: string) => {
    if (computedStart && v) {
      const s = toDate(computedStart);
      const e = toDate(v);
      if (s && e && e >= s) {
        if (form.autoSchedule === false) {
          set("estimateDays", Math.round((e.getTime() - s.getTime()) / 864e5) + 1);
        } else {
          let c = new Date(s);
          let k = 1;
          while (fmtDate(c) !== v) {
            c = addD(c, 1);
            if (!isWE(c) && !isHol(c, data.project.holidays || [])) k++;
          }
          set("estimateDays", k);
        }
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 400,
        background: "#fff",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        borderLeft: `1px solid ${S.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: `1px solid ${S.border}`,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>Edit Task</h3>
        <IconBtn onClick={onClose}>
          <XIcon />
        </IconBtn>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Type</Label>
            <Select
              value={form.type}
              onChange={(v) => set("type", v as Task["type"])}
              options={[
                { value: "definitive", label: "Definitive" },
                { value: "research", label: "Research" },
              ]}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(v) => set("status", v as Task["status"])}
              options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Start Date</Label>
            <Input type="date" value={computedStart} onChange={(e) => onStartChange(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <Label>End Date</Label>
            <Input type="date" value={computedEnd} onChange={(e) => onEndChange(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Label>Estimate (days)</Label>
            <Input
              type="number"
              value={form.estimateDays || ""}
              onChange={(e) => set("estimateDays", parseInt(e.target.value) || 0)}
            />
            {form.originalEstimateDays > 0 && form.estimateDays !== form.originalEstimateDays && (
              <p style={{ fontSize: 11, color: "#dc2626", margin: "4px 0 0" }}>
                Original estimate was {form.originalEstimateDays}d — {form.estimateDays > form.originalEstimateDays ? `+${form.estimateDays - form.originalEstimateDays}d over` : `${form.originalEstimateDays - form.estimateDays}d under`}
              </p>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <Label>Assigned To</Label>
            <Select
              value={form.assignedTo}
              onChange={(v) => set("assignedTo", v || null)}
              placeholder="Unassigned"
              options={data.project.teamMembers.map((m) => ({ value: m.id, label: m.name }))}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {form.pinned && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                background: "#fef3c7",
                fontSize: 11,
                color: "#92400e",
                fontWeight: 600,
              }}
            >
              📌 Pinned
            </div>
          )}
          {form.autoSchedule === false && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                background: "#fee2e2",
                fontSize: 11,
                color: "#991b1b",
                fontWeight: 600,
              }}
            >
              ⏸ Scheduler off
            </div>
          )}
          {form.autoSchedule !== false && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                background: "#dcfce7",
                fontSize: 11,
                color: "#166534",
                fontWeight: 600,
              }}
            >
              ▶ Auto-scheduled
            </div>
          )}
        </div>
        {form.status === "done" && (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Label>Actual Start</Label>
              <Input type="date" value={form.actualStart || ""} onChange={(e) => set("actualStart", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Actual End</Label>
              <Input type="date" value={form.actualEnd || ""} onChange={(e) => set("actualEnd", e.target.value)} />
            </div>
          </div>
        )}
        <div>
          <Label>Milestone</Label>
          <Select
            value={form.milestoneId}
            onChange={(v) => set("milestoneId", v)}
            placeholder="None"
            options={data.milestones.map((m) => ({ value: m.id, label: m.name }))}
          />
        </div>
        <div>
          <Label>Parent Task</Label>
          <Select
            value={form.parentId || ""}
            onChange={(v) => set("parentId", v || null)}
            placeholder="None (top-level)"
            options={data.tasks
              .filter((t) => t.id !== task.id && t.milestoneId === form.milestoneId && !t.parentId)
              .map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>
        <div>
          <Label>Dependencies</Label>
          <div style={{ maxHeight: 160, overflowY: "auto", border: `1px solid ${S.border}`, borderRadius: 8, padding: 8 }}>
            {depOpts.length === 0 && <p style={{ fontSize: 12, color: S.textMuted, margin: 0 }}>No other tasks</p>}
            {depOpts.map((o) => (
              <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "3px 0" }}>
                <input type="checkbox" checked={(form.dependencies || []).includes(o.value)} onChange={() => toggleDep(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <textarea
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            style={{
              width: "100%",
              border: `1px solid ${S.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between" }}>
        <Btn onClick={() => onDelete(task.id)} variant="danger">
          Delete
        </Btn>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={onClose} variant="secondary">
            Cancel
          </Btn>
          <Btn onClick={() => onSave(form)}>Save</Btn>
        </div>
      </div>
    </div>
  );
}
