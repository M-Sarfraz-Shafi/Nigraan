import { daysB, fmtDate, isHol, today } from "../domain/dates";
import type { Holiday } from "../domain/types";
import { S } from "../styles";

export interface ReleaseMarker {
  date: Date;
  color: string;
  label: string;
}

function markerIdx(days: Date[], m: ReleaseMarker) {
  const i = daysB(days[0] || today(), m.date);
  return i >= 0 && i < days.length ? i : null;
}

export function CalHeader({ days, dayW, holidays, markers }: { days: Date[]; dayW: number; holidays: Holiday[]; markers?: ReleaseMarker[] }) {
  const mos: { m: string; s: number; c: number }[] = [];
  let cm = -1;
  days.forEach((d, i) => {
    const m = d.getMonth();
    if (m !== cm) {
      mos.push({ m: d.toLocaleString("en", { month: "short", year: "numeric" }), s: i, c: 1 });
      cm = m;
    } else mos[mos.length - 1].c++;
  });
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: `1px solid ${S.border}`, width: days.length * dayW }}>
      <div style={{ display: "flex", height: 22 }}>
        {mos.map((m, i) => (
          <div
            key={i}
            style={{ width: m.c * dayW, minWidth: m.c * dayW, fontSize: 11, fontWeight: 600, color: S.text, display: "flex", alignItems: "center", paddingLeft: 6, borderRight: `1px solid ${S.border}` }}
          >
            {m.c * dayW > 50 ? m.m : ""}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", height: 24 }}>
        {days.map((d, i) => {
          const day = d.getDay();
          const isSat = day === 6;
          const isSun = day === 0;
          const w = isSat || isSun;
          const h = isHol(d, holidays);
          const t = fmtDate(d) === fmtDate(today());
          const label = dayW >= 18 ? d.getDate() : "";
          const bg = t ? "#fef2f2" : isSat ? "#f8fafc" : isSun ? "#f1f5f9" : "transparent";
          return (
            <div
              key={i}
              style={{
                width: dayW,
                minWidth: dayW,
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRight: "1px solid #f3f4f6",
                color: t ? "#ef4444" : h ? "#d97706" : isSun ? "#c4b5fd" : isSat ? "#a5b4fc" : "#9ca3af",
                fontWeight: t ? 700 : w ? 500 : 400,
                background: bg,
              }}
              title={h ? holidays.find((x) => x.date === fmtDate(d))?.name : isSat ? "Saturday" : isSun ? "Sunday" : ""}
            >
              {label}
            </div>
          );
        })}
      </div>
      {(markers || []).map((m, i) => {
        const idx = markerIdx(days, m);
        if (idx === null) return null;
        const x = idx * dayW + dayW / 2;
        return (
          <div key={i} style={{ position: "absolute", left: x - 5, bottom: -1, width: 10, height: 10, zIndex: 11 }} title={`${m.label}: ${fmtDate(m.date)}`}>
            <svg viewBox="0 0 10 10" width={10} height={10}>
              <circle cx="5" cy="5" r="4.5" fill={m.color} stroke="#fff" strokeWidth="1.5" />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

export function DayCols({ days, dayW, holidays, markers }: { days: Date[]; dayW: number; holidays: Holiday[]; markers?: ReleaseMarker[] }) {
  const ti = daysB(days[0] || today(), today());
  return (
    <>
      {ti >= 0 && ti < days.length && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: ti * dayW + dayW / 2, width: 2, background: "#ef4444", opacity: 0.35, zIndex: 5 }} />
      )}
      {(markers || []).map((m, i) => {
        const idx = markerIdx(days, m);
        if (idx === null) return null;
        return (
          <div
            key={i}
            style={{ position: "absolute", top: 0, bottom: 0, left: idx * dayW + dayW / 2, width: 0, opacity: 0.55, zIndex: 5, borderLeft: `2px dashed ${m.color}` }}
            title={`${m.label}: ${fmtDate(m.date)}`}
          />
        );
      })}
      {days.map((d, i) => {
        if (d.getDay() !== 6) return null;
        return (
          <div
            key={"sat" + i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: i * dayW,
              width: dayW,
              background: "repeating-linear-gradient(135deg,#f1f5f9,#f1f5f9 3px,#e8ecf1 3px,#e8ecf1 6px)",
              borderRight: "1.5px solid #cbd5e1",
            }}
          />
        );
      })}
      {days.map((d, i) => {
        if (d.getDay() !== 0) return null;
        return (
          <div
            key={"sun" + i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: i * dayW,
              width: dayW,
              background: "repeating-linear-gradient(135deg,#eef1f6,#eef1f6 3px,#e2e7ee 3px,#e2e7ee 6px)",
              borderLeft: "1.5px solid #cbd5e1",
            }}
          />
        );
      })}
      {days.map((d, i) => {
        if (!isHol(d, holidays)) return null;
        const h = holidays.find((x) => x.date === fmtDate(d));
        return (
          <div
            key={"hol" + i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: i * dayW,
              width: dayW,
              background: "repeating-linear-gradient(135deg,#fef3c7,#fef3c7 3px,#fde68a55 3px,#fde68a55 6px)",
              zIndex: 1,
              borderLeft: "1.5px solid #fbbf24",
              borderRight: "1.5px solid #fbbf24",
            }}
            title={h?.name || "Holiday"}
          />
        );
      })}
    </>
  );
}
