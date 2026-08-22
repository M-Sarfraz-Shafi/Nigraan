import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { S } from "../styles";
import { fmtDate, toDate, today, wdBetween } from "../domain/dates";
import { PIE_COLORS } from "../domain/types";
import type { ProjectData, ScheduledTask } from "../domain/types";
import { Badge, Card } from "../components/atoms";

function Stat({ label, value, sub, color, icon }: { label: string; value: ReactNode; sub: string; color?: string; icon: string }) {
  return (
    <Card style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: S.textSec, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: color || S.text, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 12, color: S.textMuted, marginTop: 4 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 24, opacity: 0.3 }}>{icon}</div>
      </div>
    </Card>
  );
}

export function DashboardView({ data, scheduled }: { data: ProjectData; scheduled: ScheduledTask[] }) {
  const hols = data.project.holidays || [];
  const allLeaf = scheduled.filter((t) => !t.isParent);
  // Shelved work is tracked separately (see the Not Pursuing card below) and excluded
  // from completion / forecast / attention metrics, which are about work still in play.
  const npTasks = allLeaf.filter((t) => t.status === "not_pursuing");
  const npDays = npTasks.reduce((sum, t) => sum + (t.estimateDays || 0), 0);
  const leaf = allLeaf.filter((t) => t.status !== "not_pursuing");
  const total = leaf.length;
  const done = leaf.filter((t) => t.status === "done").length;
  const inP = leaf.filter((t) => t.status === "in_progress").length;
  const blk = leaf.filter((t) => t.status === "blocked").length;
  const ns = leaf.filter((t) => t.status === "not_started").length;
  const research = leaf.filter((t) => t.type === "research" && t.status !== "done");
  let pEnd: Date | null = null;
  leaf.forEach((t) => {
    if (t.computed?.endDate) {
      const e = toDate(t.computed.endDate)!;
      if (!pEnd || e > pEnd) pEnd = e;
    }
  });
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const dLeft = pEnd ? wdBetween(today(), pEnd, hols) : null;
  const statusData = [
    { name: "Not Started", value: ns, color: PIE_COLORS[0] },
    { name: "In Progress", value: inP, color: PIE_COLORS[1] },
    { name: "Done", value: done, color: PIE_COLORS[2] },
    { name: "Blocked", value: blk, color: PIE_COLORS[3] },
    { name: "Not Pursuing", value: npTasks.length, color: PIE_COLORS[4] },
  ].filter((d) => d.value > 0);
  const targetRelease = toDate(data.project.targetReleaseDate || null);
  const forecastEnd = pEnd as Date | null;
  const hasBothDates = targetRelease !== null && forecastEnd !== null;
  const targetTime = targetRelease ? targetRelease.getTime() : 0;
  const forecastTime = forecastEnd ? forecastEnd.getTime() : 0;
  // wdBetween only counts forward from its first argument, so the earlier date
  // must always be passed first — the sign is tracked separately.
  const varianceDays = hasBothDates
    ? wdBetween(forecastTime <= targetTime ? forecastEnd! : targetRelease!, forecastTime <= targetTime ? targetRelease! : forecastEnd!, hols) * (forecastTime > targetTime ? 1 : -1)
    : null;
  const unassigned = leaf.filter((t) => t.status !== "done" && !t.assignedTo);
  const overdue = leaf.filter((t) => t.status !== "done" && t.computed?.endDate && toDate(t.computed.endDate)! < today());
  const msP = data.milestones.map((ms) => {
    const ts = leaf.filter((t) => t.milestoneId === ms.id);
    const d2 = ts.filter((t) => t.status === "done").length;
    let end: Date | null = null;
    ts.forEach((t) => {
      if (t.computed?.endDate) {
        const e = toDate(t.computed.endDate)!;
        if (!end || e > end) end = e;
      }
    });
    return { ...ms, total: ts.length, done: d2, end, pct: ts.length > 0 ? Math.round((d2 / ts.length) * 100) : 0 };
  });
  const memL = data.project.teamMembers.map((m) => {
    const ts = leaf.filter((t) => t.assignedTo === m.id && t.status !== "done");
    let le: Date | null = null;
    ts.forEach((t) => {
      if (t.computed?.endDate) {
        const e = toDate(t.computed.endDate)!;
        if (!le || e > le) le = e;
      }
    });
    const cur = ts.find((t) => t.status === "in_progress") || ts.find((t) => t.computed && toDate(t.computed.startDate)! <= today());
    const nxt = ts.filter((t) => t.id !== cur?.id).sort((a, b) => (a.computed?.startDate || "z").localeCompare(b.computed?.startDate || "z"))[0];
    return { ...m, pending: ts.length, freeDate: le, cur, nxt };
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 24 }}>
        <Stat label="Completion" value={`${pct}%`} sub={`${done}/${total} tasks`} color={pct === 100 ? "#10b981" : S.primary} icon="✓" />
        <Stat label="Release Date" value={pEnd ? fmtDate(pEnd) : "—"} sub={dLeft !== null ? `${dLeft} work days left` : "No tasks"} icon="📅" />
        <Stat label="Blocked" value={blk} sub="need attention" color={blk ? "#ef4444" : "#10b981"} icon="⚠" />
        <Stat label="Open Research" value={research.length} sub="may reshape plan" color={research.length ? "#f59e0b" : "#10b981"} icon="🔬" />
        <Stat label="Not Pursuing" value={npTasks.length} sub={`${npDays}d already invested`} color={npTasks.length ? "#a855f7" : S.textSec} icon="🗇" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: S.text, marginBottom: 12, textTransform: "uppercase" }}>Task Status</div>
          {allLeaf.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                    {statusData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {statusData.map((d) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                    <span style={{ fontSize: 12 }}>{d.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, marginLeft: "auto" }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ color: S.textMuted }}>No tasks</p>
          )}
        </Card>
        <Card style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: S.text, marginBottom: 12, textTransform: "uppercase" }}>Schedule Health</div>
          {targetRelease ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 10, color: S.textMuted, textTransform: "uppercase", letterSpacing: "0.4px" }}>Target</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#7c3aed" }}>{fmtDate(targetRelease)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: S.textMuted, textTransform: "uppercase", letterSpacing: "0.4px" }}>Tentative (forecast)</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#b45309" }}>{pEnd ? fmtDate(pEnd) : "—"}</div>
                </div>
              </div>
              {varianceDays !== null && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: varianceDays > 0 ? "#fef2f2" : "#f0fdf4",
                    color: varianceDays > 0 ? "#b91c1c" : "#15803d",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {varianceDays > 0 ? "⚠" : "✓"}{" "}
                  {varianceDays === 0 ? "On track — forecast matches target" : varianceDays > 0 ? `${varianceDays} work days behind target` : `${-varianceDays} work days ahead of target`}
                </div>
              )}
              <div>
                <div style={{ fontSize: 10, color: S.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>Needs attention</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Badge color={overdue.length ? "#ef4444" : S.textSec}>{overdue.length} overdue</Badge>
                  <Badge color={unassigned.length ? "#f59e0b" : S.textSec}>{unassigned.length} unassigned</Badge>
                  <Badge color={blk ? "#ef4444" : S.textSec}>{blk} blocked</Badge>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: S.textMuted, fontSize: 12 }}>No target release date set yet — a project owner can set one in Settings.</p>
          )}
        </Card>
      </div>
      <Card style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: S.text, marginBottom: 16, textTransform: "uppercase" }}>Milestones</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {msP.map((ms) => (
            <div key={ms.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 4, background: ms.color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{ms.name}</span>
                  <Badge color={ms.pct === 100 ? "#10b981" : ms.color}>{ms.pct}%</Badge>
                </div>
                <span style={{ fontSize: 12, color: S.textSec }}>
                  {ms.done}/{ms.total} · {ms.end ? fmtDate(ms.end) : "—"}
                </span>
              </div>
              <div style={{ height: 6, background: "#f3f4f6", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${ms.color},${ms.color}cc)`, width: `${ms.pct}%` }} />
              </div>
            </div>
          ))}
          {msP.length === 0 && <p style={{ color: S.textMuted }}>No milestones</p>}
        </div>
      </Card>
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: S.text, marginBottom: 16, textTransform: "uppercase" }}>Team</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {memL.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f9fafb", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg,${m.color},${m.color}aa)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>
                  {m.name[0]}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: S.textSec }}>
                    {m.cur ? (
                      <>
                        Working on <strong>{m.cur.name}</strong>
                      </>
                    ) : (
                      "No active task"
                    )}
                    {m.nxt && <> · Next: {m.nxt.name}</>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{m.pending}</div>
                <div style={{ fontSize: 11, color: S.textMuted }}>pending · Free {m.freeDate ? fmtDate(m.freeDate) : "now"}</div>
              </div>
            </div>
          ))}
          {memL.length === 0 && <p style={{ color: S.textMuted }}>No team members</p>}
        </div>
      </Card>
    </div>
  );
}
