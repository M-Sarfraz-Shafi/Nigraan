import { useState } from "react";
import { S } from "../styles";
import { daysB, fmtDate, today, toDate, uid } from "../domain/dates";
import type { ProjectData, ScheduledTask } from "../domain/types";
import { Btn, Camera, Card, IconBtn, Trash } from "../components/atoms";

export function BaselineView({ data, scheduled, save }: { data: ProjectData; scheduled: ScheduledTask[]; save: (d: ProjectData) => void }) {
  const [selId, setSelId] = useState<string | null>(null);

  const saveBL = () => {
    const sn = {
      id: uid(),
      name: `Snapshot ${data.baselines.length + 1} — ${fmtDate(today())}`,
      date: fmtDate(today()),
      tasks: scheduled.map((t) => ({
        id: t.id,
        name: t.name,
        milestoneId: t.milestoneId,
        parentId: t.parentId,
        estimateDays: t.estimateDays,
        assignedTo: t.assignedTo,
        status: t.status,
        dependencies: [...(t.dependencies || [])],
        computedStart: t.computed?.startDate || null,
        computedEnd: t.computed?.endDate || null,
        type: t.type,
      })),
    };
    save({ ...data, baselines: [...data.baselines, sn] });
  };
  const delBL = (id: string) => {
    save({ ...data, baselines: data.baselines.filter((b) => b.id !== id) });
    if (selId === id) setSelId(null);
  };
  const sel = data.baselines.find((b) => b.id === selId);
  const sMap = Object.fromEntries(scheduled.map((t) => [t.id, t]));

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: 0 }}>Baselines & Drift</h2>
        <Btn onClick={saveBL}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Camera /> Save Snapshot
          </span>
        </Btn>
      </div>
      {data.baselines.length === 0 && (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: S.textMuted, fontSize: 13 }}>No baselines yet.</p>
        </Card>
      )}
      {data.baselines.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {data.baselines.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => setSelId(b.id)}
                style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: selId === b.id ? `2px solid ${S.primary}` : `1px solid ${S.border}`, background: selId === b.id ? S.primaryLight : "#fff", cursor: "pointer", fontWeight: selId === b.id ? 600 : 400, color: S.text }}
              >
                {b.name}
              </button>
              <IconBtn onClick={() => delBL(b.id)}>
                <Trash />
              </IconBtn>
            </div>
          ))}
        </div>
      )}
      {sel && (
        <Card>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                {["Task", "Orig", "Now", "Original Dates", "Current Dates", "Drift"].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", fontWeight: 600, color: S.textSec, textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sel.tasks.map((bt) => {
                const cur = sMap[bt.id];
                if (!cur)
                  return (
                    <tr key={bt.id} style={{ borderBottom: `1px solid ${S.borderLight}` }}>
                      <td style={{ padding: "8px 14px", textDecoration: "line-through", color: S.textMuted }}>{bt.name}</td>
                      <td colSpan={5} style={{ padding: "8px 14px", fontSize: 12, color: "#ef4444" }}>
                        Removed
                      </td>
                    </tr>
                  );
                const oE = bt.computedEnd ? toDate(bt.computedEnd) : null;
                const cE = cur.computed?.endDate ? toDate(cur.computed.endDate) : null;
                const drift = oE && cE ? daysB(oE, cE) : null;
                const eC = bt.estimateDays !== cur.estimateDays;
                const dC = JSON.stringify([...(bt.dependencies || [])].sort()) !== JSON.stringify([...(cur.dependencies || [])].sort());
                return (
                  <tr key={bt.id} style={{ borderBottom: `1px solid ${S.borderLight}` }}>
                    <td style={{ padding: "8px 14px", color: S.text, fontWeight: 500 }}>{bt.name}</td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: eC ? "#f59e0b" : S.textSec }}>{bt.estimateDays}d</td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: eC ? "#f59e0b" : S.textSec }}>
                      {cur.estimateDays}d{eC && " ⚠"}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: S.textSec, fontFamily: "monospace" }}>
                      {bt.computedStart || "—"} → {bt.computedEnd || "—"}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: S.textSec, fontFamily: "monospace" }}>
                      {cur.computed?.startDate || "—"} → {cur.computed?.endDate || "—"}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: drift !== null && drift > 0 ? "#ef4444" : drift !== null && drift < 0 ? "#10b981" : S.textSec }}>
                      {drift !== null ? (drift > 0 ? `+${drift}d late` : drift < 0 ? `${drift}d early` : "On track") : "—"}
                      {dC && <span style={{ marginLeft: 4 }}>🔗</span>}
                    </td>
                  </tr>
                );
              })}
              {scheduled
                .filter((t) => !sel.tasks.find((b) => b.id === t.id))
                .map((t) => (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${S.borderLight}`, background: "#f0fdf4" }}>
                    <td style={{ padding: "8px 14px", color: "#10b981", fontWeight: 500 }}>
                      {t.name} <span style={{ fontSize: 11 }}>(new)</span>
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: S.textMuted }}>—</td>
                    <td style={{ padding: "8px 14px", fontSize: 12 }}>{t.estimateDays}d</td>
                    <td style={{ padding: "8px 14px", color: S.textMuted }}>—</td>
                    <td style={{ padding: "8px 14px", fontSize: 11, fontFamily: "monospace" }}>
                      {t.computed?.startDate || "—"} → {t.computed?.endDate || "—"}
                    </td>
                    <td style={{ padding: "8px 14px", color: S.textMuted }}>—</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
